import { createHash } from 'node:crypto';
import {
  createStage01Bundle,
  createStage02Bundle,
  createStage03Bundle,
  createStage04Bundle,
  createStage05Bundle,
  createStage06Bundle,
  createStage07Bundle,
} from '../src/core/content';
import { LocalPracticeAuthority, type LocalAuthoritySnapshotV1 } from '../src/core/local-authority';
import { checkpointChecksum, MiniGameSaveStore } from '../src/platform/wechat';

const assert = {
  equal(actual: unknown, expected: unknown): void {
    if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  },
  deepEqual(actual: unknown, expected: unknown): void {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  },
  ok(value: unknown): void {
    if (!value) throw new Error(`Expected a truthy value, received ${String(value)}`);
  },
  throws(callback: () => unknown, messagePart: string): void {
    let thrown: unknown;
    try {
      callback();
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof Error) || !thrown.message.includes(messagePart)) {
      throw new Error(`Expected error containing ${messagePart}, received ${String(thrown)}`);
    }
  },
};

const bundle = createStage01Bundle();
const authority = new LocalPracticeAuthority(bundle, 0x51a7e);
const initialOffer = authority.requestOffer(2);
assert.equal(authority.getRerollsRemaining(2), 3);
assert.equal(authority.snapshot().offersSincePurple, 0);

const replacementOffer = authority.requestOffer(2, initialOffer.offerId);
assert.equal(authority.getRerollsRemaining(2), 0);
assert.equal(authority.snapshot().offersSincePurple, 0);
const beforeRejectedReroll = authority.snapshot();
assert.throws(
  () => authority.requestOffer(2, replacementOffer.offerId),
  'no rerolls remaining',
);
assert.deepEqual(authority.snapshot(), beforeRejectedReroll);
assert.throws(
  () => authority.acceptChoice(initialOffer.offerId, initialOffer.cards[0]),
  'no longer active',
);

const afterRejectedReroll = authority.snapshot();
const accepted = authority.acceptChoice(replacementOffer.offerId, replacementOffer.cards[0]);
const replacementHasPurple = replacementOffer.cards.some((cardId) => cardId.endsWith('_P'));
assert.equal(authority.snapshot().offersSincePurple, replacementHasPurple ? 0 : 1);

const validationAuthority = new LocalPracticeAuthority(bundle, 0xfeed);
const validationOffer = validationAuthority.requestOffer(3);
const beforeInvalidRequests = validationAuthority.snapshot();
assert.throws(() => validationAuthority.requestOffer(3), 'already granted');
assert.throws(
  () => validationAuthority.requestOffer(4, validationOffer.offerId),
  'belongs to ordinal 3',
);
assert.deepEqual(validationAuthority.snapshot(), beforeInvalidRequests);
assert.equal(authority.getRerollsRemaining(2), 0);
assert.deepEqual(authority.acceptChoice(replacementOffer.offerId, accepted.cardId), accepted);
assert.equal(authority.snapshot().offersSincePurple, replacementHasPurple ? 0 : 1);

const restored = new LocalPracticeAuthority(bundle, 123, afterRejectedReroll);
assert.equal(restored.getRerollsRemaining(2), 0);
assert.throws(
  () => restored.requestOffer(2, replacementOffer.offerId),
  'no rerolls remaining',
);

const legacyRerollSnapshot = structuredClone(afterRejectedReroll);
delete legacyRerollSnapshot.rerolledOfferOrdinals;
const restoredLegacyReroll = new LocalPracticeAuthority(bundle, 456, legacyRerollSnapshot);
assert.equal(restoredLegacyReroll.getRerollsRemaining(2), 0);

const storage = new Map<string, unknown>();
Object.assign(globalThis, {
  wx: {
    getStorageSync(key: string): unknown {
      const value = storage.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    setStorageSync(key: string, value: unknown): void {
      storage.set(key, structuredClone(value));
    },
    removeStorageSync(key: string): void {
      storage.delete(key);
    },
  },
});
const checkpointText = JSON.stringify({ tick: 12 });
const saveStore = new MiniGameSaveStore();
saveStore.save({
  schemaVersion: 2,
  stageId: 'STAGE_01',
  configHash: bundle.configHash,
  seed: 123,
  tick: 12,
  savedAt: 34,
  checkpointText,
  checkpointChecksum: checkpointChecksum(checkpointText),
  authoritySnapshot: afterRejectedReroll,
});
const loadedRerollSnapshot = saveStore.load('STAGE_01', bundle.configHash)?.authoritySnapshot;
assert.deepEqual(loadedRerollSnapshot, afterRejectedReroll);

assert.equal(afterRejectedReroll.releaseId, bundle.releaseId);
assert.equal(afterRejectedReroll.configHash, bundle.configHash);
assert.equal(afterRejectedReroll.initialSeed, 0x51a7e);
assert.ok(afterRejectedReroll.activeOfferByOrdinal?.some(
  ([ordinal, offerId]) => ordinal === 2 && offerId === replacementOffer.offerId,
));

function expectInvalidAuthoritySnapshot(
  mutate: (snapshot: LocalAuthoritySnapshotV1) => void,
  messagePart: string,
): void {
  const snapshot = structuredClone(afterRejectedReroll);
  mutate(snapshot);
  assert.throws(
    () => new LocalPracticeAuthority(bundle, 0x51a7e, snapshot),
    messagePart,
  );
}

expectInvalidAuthoritySnapshot(
  (snapshot) => { (snapshot as { schemaVersion: number }).schemaVersion = 2; },
  'snapshot schema',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.releaseId = 'WRONG_RELEASE'; },
  'snapshot header',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.configHash = 'sha256:wrong'; },
  'snapshot header',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.initialSeed = 0x1_0000_0000; },
  'snapshot header',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { delete snapshot.configHash; },
  'snapshot header',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.rngState = 0; },
  'RNG state',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.rngState = Number.MAX_SAFE_INTEGER; },
  'RNG state',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.authoritySeq = Number.MAX_SAFE_INTEGER; },
  'sequence state',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.offerSerial = Number.MAX_SAFE_INTEGER; },
  'sequence state',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.offersSincePurple = 10; },
  'pity state',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.consecutiveGreenSlots = 5; },
  'pity state',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.rerolledOfferOrdinals = []; },
  'rerolls do not match',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.rerolledOfferOrdinals = [2, 2]; },
  'duplicate reroll',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.eligibleEffectsByOrdinal = []; },
  'eligible effects do not match',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => {
    const entry = snapshot.eligibleEffectsByOrdinal?.[0];
    if (entry) entry[1] = [entry[1][0], entry[1][0]];
  },
  'invalid eligible effects',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => {
    const entry = snapshot.activeOfferByOrdinal?.[0];
    if (entry) entry[1] = initialOffer.offerId;
  },
  'active offers do not match',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => { snapshot.offerSerial -= 1; },
  'offer serial does not match',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => {
    const event = snapshot.offers[0]?.[1];
    if (event) event.authorizationId = 'practice-auth-wrong';
  },
  'offer practice-offer',
);
expectInvalidAuthoritySnapshot(
  (snapshot) => {
    const event = snapshot.offers[0]?.[1];
    if (event) event.cards[0] = 'MISSING_CARD';
  },
  'offer practice-offer',
);

const legacyHeaderSnapshot = structuredClone(afterRejectedReroll);
delete legacyHeaderSnapshot.releaseId;
delete legacyHeaderSnapshot.configHash;
delete legacyHeaderSnapshot.initialSeed;
assert.deepEqual(
  new LocalPracticeAuthority(bundle, 0xdeadbeef, legacyHeaderSnapshot).snapshot().offers,
  afterRejectedReroll.offers,
);

const nearSequenceLimitSnapshot = structuredClone(afterRejectedReroll);
nearSequenceLimitSnapshot.authoritySeq = Number.MAX_SAFE_INTEGER - 2;
const nearSequenceLimitAuthority = new LocalPracticeAuthority(
  bundle,
  0x51a7e,
  nearSequenceLimitSnapshot,
);
const finalSafeSequenceOffer = nearSequenceLimitAuthority.requestOffer(3);
assert.equal(finalSafeSequenceOffer.authoritySeq, Number.MAX_SAFE_INTEGER - 1);
assert.deepEqual(
  new LocalPracticeAuthority(
    bundle,
    0x51a7e,
    nearSequenceLimitAuthority.snapshot(),
  ).snapshot(),
  nearSequenceLimitAuthority.snapshot(),
);
const beforeExhaustedAuthorityRequest = nearSequenceLimitAuthority.snapshot();
assert.throws(
  () => nearSequenceLimitAuthority.grantRevive(1),
  'authority sequence is exhausted',
);
assert.deepEqual(nearSequenceLimitAuthority.snapshot(), beforeExhaustedAuthorityRequest);

const exhaustedRequestSnapshot = structuredClone(afterRejectedReroll);
exhaustedRequestSnapshot.authoritySeq = Number.MAX_SAFE_INTEGER - 1;
const exhaustedRequestAuthority = new LocalPracticeAuthority(
  bundle,
  0x51a7e,
  exhaustedRequestSnapshot,
);
const beforeExhaustedRequest = exhaustedRequestAuthority.snapshot();
assert.throws(
  () => exhaustedRequestAuthority.requestOffer(3),
  'authority sequence is exhausted',
);
assert.deepEqual(exhaustedRequestAuthority.snapshot(), beforeExhaustedRequest);

const exhaustedChoiceSnapshot = structuredClone(afterRejectedReroll);
exhaustedChoiceSnapshot.authoritySeq = Number.MAX_SAFE_INTEGER - 1;
const exhaustedChoiceAuthority = new LocalPracticeAuthority(
  bundle,
  0x51a7e,
  exhaustedChoiceSnapshot,
);
const beforeExhaustedChoice = exhaustedChoiceAuthority.snapshot();
assert.throws(
  () => exhaustedChoiceAuthority.acceptChoice(replacementOffer.offerId, replacementOffer.cards[0]),
  'authority sequence is exhausted',
);
assert.deepEqual(exhaustedChoiceAuthority.snapshot(), beforeExhaustedChoice);

const reversedOfferSnapshot = structuredClone(afterRejectedReroll);
reversedOfferSnapshot.offers.reverse();
assert.throws(
  () => new LocalPracticeAuthority(bundle, 789, reversedOfferSnapshot),
  'invalid replacement chain',
);

let pityAuthority: LocalPracticeAuthority | undefined;
for (let candidateSeed = 1; candidateSeed <= 10_000 && pityAuthority === undefined; candidateSeed += 1) {
  const candidate = new LocalPracticeAuthority(bundle, candidateSeed);
  for (let ordinal = 1; ordinal <= 9; ordinal += 1) {
    const offer = candidate.requestOffer(ordinal);
    candidate.acceptChoice(offer.offerId, offer.cards[0]);
  }
  if (candidate.snapshot().offersSincePurple === 9) pityAuthority = candidate;
}
if (pityAuthority === undefined) throw new Error('Unable to find a deterministic purple-pity seed.');
const pityInitial = pityAuthority.requestOffer(10);
assert.ok(pityInitial.cards.some((cardId) => cardId.endsWith('_P')));
assert.equal(pityAuthority.snapshot().offersSincePurple, 9);
const pityReplacement = pityAuthority.requestOffer(10, pityInitial.offerId);
assert.ok(pityReplacement.cards.some((cardId) => cardId.endsWith('_P')));
assert.equal(pityAuthority.snapshot().offersSincePurple, 9);
pityAuthority.acceptChoice(pityReplacement.offerId, pityReplacement.cards[0]);
assert.equal(pityAuthority.snapshot().offersSincePurple, 0);

const completedAuthority = new LocalPracticeAuthority(bundle, 0xc001d00d);
for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
  const offer = completedAuthority.requestOffer(ordinal);
  completedAuthority.acceptChoice(offer.offerId, offer.cards[0]);
}
const completedSnapshot = completedAuthority.snapshot();
const legacyPitySnapshot = structuredClone(completedSnapshot);
delete legacyPitySnapshot.purplePityAdvancedOnChoice;
legacyPitySnapshot.offersSincePurple = 999;
const migratedPity = new LocalPracticeAuthority(bundle, 654, legacyPitySnapshot);
assert.equal(migratedPity.snapshot().offersSincePurple, completedSnapshot.offersSincePurple);

const stageCases = [
  {
    bundle: createStage01Bundle(),
    releaseId: 'GG_S01_ALPHA_V2',
    hp: [6_000, 9_000, 11_650, 20_000, 25_000],
  },
  {
    bundle: createStage02Bundle(),
    releaseId: 'GG_S02_ALPHA_V4',
    hp: [8_000, 14_000, 20_000, 38_000, 42_000],
  },
  {
    bundle: createStage03Bundle(),
    releaseId: 'GG_S03_ALPHA_V3',
    hp: [7_000, 15_000, 30_000, 46_350, 68_250],
  },
  {
    bundle: createStage04Bundle(),
    releaseId: 'GG_S04_ALPHA_V3',
    hp: [7_000, 17_000, 26_000, 36_000, 51_500],
  },
  {
    bundle: createStage05Bundle(),
    releaseId: 'GG_S05_ALPHA_V3',
    hp: [8_500, 19_000, 30_000, 44_000, 50_000],
  },
  {
    bundle: createStage06Bundle(),
    releaseId: 'GG_S06_ALPHA_V2',
    hp: [6_500, 15_000, 27_000, 36_000, 58_000],
  },
  {
    bundle: createStage07Bundle(),
    releaseId: 'GG_S07_ALPHA_V2',
    hp: [4_000, 18_000, 35_000, 49_000, 55_000],
  },
] as const;

for (const stageCase of stageCases) {
  assert.equal(stageCase.bundle.releaseId, stageCase.releaseId);
  assert.deepEqual(stageCase.bundle.waves.map((wave) => wave.hpMultiplierBp), stageCase.hp);
  const hashInput = structuredClone(stageCase.bundle);
  hashInput.configHash = '';
  const expectedHash = `sha256:${createHash('sha256').update(JSON.stringify(hashInput)).digest('hex')}`;
  assert.equal(stageCase.bundle.configHash, expectedHash);
}

console.log('✓ 难度加压、单次重抽、选卡保底与 Authority snapshot 恢复通过');
