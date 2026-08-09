import type {
  BattleBundleV1,
  CardChoiceAccepted,
  CardDefinition,
  CardEffectId,
  OfferGranted,
  ReviveGranted,
} from './contracts';

export interface LocalAuthoritySnapshotV1 {
  schemaVersion: 1;
  /** Missing together in legacy snapshots created before authority headers were persisted. */
  releaseId?: string;
  configHash?: string;
  initialSeed?: number;
  rngState: number;
  authoritySeq: number;
  offerSerial: number;
  offersSincePurple: number;
  /** Missing in legacy snapshots whose pity counter advanced when an offer was granted. */
  purplePityAdvancedOnChoice?: true;
  consecutiveGreenSlots: number;
  /** Missing in legacy snapshots; replacement events are still used to infer consumed rerolls. */
  rerolledOfferOrdinals?: number[];
  /** Missing in legacy snapshots, where every card effect remained eligible. */
  eligibleEffectsByOrdinal?: Array<[number, CardEffectId[]]>;
  /** Missing in legacy snapshots; the active offer can be derived from the replacement chain. */
  activeOfferByOrdinal?: Array<[number, string]>;
  acceptedChoices: Array<[string, CardChoiceAccepted]>;
  offers: Array<[string, OfferGranted]>;
}

class XorShift32 {
  constructor(public state: number) {
    this.state = state >>> 0 || 0x6d2b79f5;
  }

  nextU32(): number {
    let value = this.state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`maxExclusive must be a positive integer, received ${maxExclusive}`);
    }
    return this.nextU32() % maxExclusive;
  }
}

const QUALITY_ORDER = ['G', 'B', 'P'] as const;
type Quality = (typeof QUALITY_ORDER)[number];
const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;
const SEQUENCE_RESERVE = 1;
const MAX_PERSISTED_SEQUENCE = Number.MAX_SAFE_INTEGER - SEQUENCE_RESERVE;
const MAX_PURPLE_PITY = 9;
const MAX_CONSECUTIVE_GREEN_SLOTS = 4;
const FIXED_CAMPAIGN_REROLL_BUDGET = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function copyOffer(event: OfferGranted): OfferGranted {
  return {
    ...event,
    cards: [...event.cards] as [string, string, string],
  };
}

function copyChoice(event: CardChoiceAccepted): CardChoiceAccepted {
  return { ...event };
}

export class LocalPracticeAuthority {
  private readonly bundle: BattleBundleV1;
  private readonly initialSeed: number;
  private readonly rng: XorShift32;
  private readonly cardsByEffect = new Map<CardEffectId, Map<Quality, CardDefinition>>();
  private readonly offers = new Map<string, OfferGranted>();
  private readonly acceptedChoices = new Map<string, CardChoiceAccepted>();
  private readonly offerOrdinals = new Map<string, number>();
  private readonly activeOfferByOrdinal = new Map<number, string>();
  private readonly completedOfferOrdinals = new Set<number>();
  private readonly rerolledOfferOrdinals = new Set<number>();
  private readonly eligibleEffectsByOrdinal = new Map<number, CardEffectId[]>();
  private authoritySeq = 0;
  private offerSerial = 0;
  private offersSincePurple = 0;
  private consecutiveGreenSlots = 0;

  constructor(bundle: BattleBundleV1, seed: number, snapshot?: LocalAuthoritySnapshotV1) {
    this.bundle = bundle;
    this.initialSeed = snapshot?.initialSeed ?? (seed >>> 0);
    for (const card of bundle.cards) {
      const qualities = this.cardsByEffect.get(card.effectId) ?? new Map<Quality, CardDefinition>();
      qualities.set(card.quality, card);
      this.cardsByEffect.set(card.effectId, qualities);
    }

    if (this.cardsByEffect.size < 3) {
      throw new Error('LocalPracticeAuthority requires at least three distinct card effects');
    }

    if (snapshot !== undefined) {
      this.validateSnapshotEnvelope(snapshot);
    }
    this.rng = new XorShift32(snapshot?.rngState ?? (seed ^ 0xa341316c));

    if (snapshot !== undefined) {
      this.authoritySeq = snapshot.authoritySeq;
      this.offerSerial = snapshot.offerSerial;
      this.consecutiveGreenSlots = snapshot.consecutiveGreenSlots;
      this.restoreOfferState(snapshot);
      const derivedOffersSincePurple = this.deriveOffersSincePurple();
      if (
        snapshot.purplePityAdvancedOnChoice === true &&
        snapshot.offersSincePurple !== derivedOffersSincePurple
      ) {
        throw new Error('Authority snapshot purple pity does not match its accepted choices.');
      }
      this.offersSincePurple = derivedOffersSincePurple;
    }
  }

  requestOffer(
    offerOrdinal: number,
    replacesOfferId?: string,
    eligibleEffectIds?: readonly CardEffectId[],
  ): OfferGranted {
    this.assertOfferOrdinal(offerOrdinal);
    this.validateOfferRequest(offerOrdinal, replacesOfferId);
    const nextAuthoritySeq = this.nextSequence(this.authoritySeq, 'authority');
    const nextOfferSerial = this.nextSequence(this.offerSerial, 'offer');

    const effects = this.resolveEligibleEffects(offerOrdinal, replacesOfferId, eligibleEffectIds);
    const distinctEffects = [...effects];
    const selectedEffects: CardEffectId[] = [];
    while (selectedEffects.length < 3) {
      const source = distinctEffects.length > 0 ? distinctEffects : effects;
      const index = this.rng.nextInt(source.length);
      const effect = distinctEffects.length > 0
        ? distinctEffects.splice(index, 1)[0]
        : source[index];
      if (effect) selectedEffects.push(effect);
    }

    const forcePurple = this.offersSincePurple >= 9;
    const selectedCardIds = new Set<string>();
    const selectedCards = selectedEffects.map((effectId, slotIndex) => {
      const quality = this.rollQuality(forcePurple && slotIndex === 0);
      const card = this.uniqueCardFor(effectId, quality, selectedCardIds);
      selectedCardIds.add(card.id);
      return card.id;
    }) as [string, string, string];

    const offerId = `practice-offer-${offerOrdinal}-${nextOfferSerial}`;
    const event: OfferGranted = {
      type: 'OFFER_GRANTED',
      authoritySeq: nextAuthoritySeq,
      authorizationId: `practice-auth-${nextAuthoritySeq}`,
      offerId,
      ...(replacesOfferId ? { replacesOfferId } : {}),
      cards: selectedCards,
    };
    this.offerSerial = nextOfferSerial;
    this.authoritySeq = nextAuthoritySeq;
    this.offers.set(offerId, event);
    this.offerOrdinals.set(offerId, offerOrdinal);
    this.activeOfferByOrdinal.set(offerOrdinal, offerId);
    if (replacesOfferId) this.rerolledOfferOrdinals.add(offerOrdinal);
    return event;
  }

  acceptChoice(offerId: string, cardId: string): CardChoiceAccepted {
    const previous = this.acceptedChoices.get(offerId);
    if (previous) {
      if (previous.cardId !== cardId) throw new Error(`offer ${offerId} already chose ${previous.cardId}`);
      return previous;
    }

    const offer = this.offers.get(offerId);
    if (!offer) throw new Error(`unknown offer ${offerId}`);
    if (!offer.cards.includes(cardId)) throw new Error(`card ${cardId} is not in offer ${offerId}`);
    const offerOrdinal = this.offerOrdinals.get(offerId);
    if (offerOrdinal === undefined) throw new Error(`offer ${offerId} has no valid ordinal`);
    if (this.activeOfferByOrdinal.get(offerOrdinal) !== offerId) {
      throw new Error(`offer ${offerId} is no longer active`);
    }
    if (this.completedOfferOrdinals.has(offerOrdinal)) {
      throw new Error(`offer ordinal ${offerOrdinal} already has an accepted choice`);
    }

    const nextAuthoritySeq = this.nextSequence(this.authoritySeq, 'authority');
    const hasPurple = offer.cards.some((offeredCardId) => this.cardById(offeredCardId).quality === 'P');
    const nextOffersSincePurple = hasPurple ? 0 : this.offersSincePurple + 1;
    if (
      !Number.isSafeInteger(nextOffersSincePurple) ||
      nextOffersSincePurple < 0 ||
      nextOffersSincePurple > MAX_PURPLE_PITY
    ) {
      throw new Error('Local authority purple pity state is exhausted.');
    }

    const event: CardChoiceAccepted = {
      type: 'CARD_CHOICE_ACCEPTED',
      authoritySeq: nextAuthoritySeq,
      authorizationId: `practice-auth-${nextAuthoritySeq}`,
      offerId,
      cardId,
    };
    this.authoritySeq = nextAuthoritySeq;
    this.offersSincePurple = nextOffersSincePurple;
    this.acceptedChoices.set(offerId, event);
    this.completedOfferOrdinals.add(offerOrdinal);
    return event;
  }

  getRerollsRemaining(offerOrdinal: number): number {
    this.assertOfferOrdinal(offerOrdinal);
    if (this.completedOfferOrdinals.has(offerOrdinal)) return 0;
    if (this.rerolledOfferOrdinals.has(offerOrdinal)) return 0;
    return (this.bundle.mode ?? 'fixed') === 'fixed'
      ? Math.max(0, FIXED_CAMPAIGN_REROLL_BUDGET - this.rerolledOfferOrdinals.size)
      : 1;
  }

  grantRevive(reviveOrdinal: number): ReviveGranted {
    if (!Number.isSafeInteger(reviveOrdinal) || reviveOrdinal < 1 || reviveOrdinal > this.bundle.rules.maxRevives) {
      throw new Error(`invalid revive ordinal ${reviveOrdinal}`);
    }
    const nextAuthoritySeq = this.nextSequence(this.authoritySeq, 'authority');
    this.authoritySeq = nextAuthoritySeq;
    return {
      type: 'REVIVE_GRANTED',
      authoritySeq: nextAuthoritySeq,
      authorizationId: `practice-auth-${nextAuthoritySeq}`,
      reviveOrdinal,
    };
  }

  snapshot(): LocalAuthoritySnapshotV1 {
    return {
      schemaVersion: 1,
      releaseId: this.bundle.releaseId,
      configHash: this.bundle.configHash,
      initialSeed: this.initialSeed,
      rngState: this.rng.state,
      authoritySeq: this.authoritySeq,
      offerSerial: this.offerSerial,
      offersSincePurple: this.offersSincePurple,
      purplePityAdvancedOnChoice: true,
      consecutiveGreenSlots: this.consecutiveGreenSlots,
      rerolledOfferOrdinals: [...this.rerolledOfferOrdinals].sort((left, right) => left - right),
      eligibleEffectsByOrdinal: [...this.eligibleEffectsByOrdinal.entries()]
        .sort(([left], [right]) => left - right)
        .map(([ordinal, effects]) => [ordinal, [...effects]]),
      activeOfferByOrdinal: [...this.activeOfferByOrdinal.entries()]
        .sort(([left], [right]) => left - right),
      acceptedChoices: [...this.acceptedChoices.entries()]
        .map(([id, event]) => [id, copyChoice(event)]),
      offers: [...this.offers.entries()]
        .map(([id, event]) => [id, copyOffer(event)]),
    };
  }

  private resolveEligibleEffects(
    offerOrdinal: number,
    replacesOfferId: string | undefined,
    requestedEffectIds: readonly CardEffectId[] | undefined,
  ): CardEffectId[] {
    const allEffects = [...this.cardsByEffect.keys()];
    const requestedSet = requestedEffectIds === undefined
      ? undefined
      : new Set(requestedEffectIds);
    if (
      requestedSet !== undefined &&
      [...requestedSet].some((effectId) => !this.cardsByEffect.has(effectId))
    ) {
      throw new Error(`offer ordinal ${offerOrdinal} contains an unknown eligible card effect`);
    }
    const normalized = requestedSet === undefined
      ? undefined
      : allEffects.filter((effectId) => requestedSet.has(effectId));
    const remembered = this.eligibleEffectsByOrdinal.get(offerOrdinal);
    if (replacesOfferId !== undefined) {
      const eligible = remembered ?? normalized ?? allEffects;
      if (normalized !== undefined && JSON.stringify(normalized) !== JSON.stringify(eligible)) {
        throw new Error(`reroll eligibility changed for offer ordinal ${offerOrdinal}`);
      }
      if (remembered === undefined) this.eligibleEffectsByOrdinal.set(offerOrdinal, [...eligible]);
      return [...eligible];
    }

    const eligible = normalized ?? allEffects;
    if (eligible.length === 0) {
      throw new Error(`offer ordinal ${offerOrdinal} has no eligible card effects`);
    }
    const availableCardCount = eligible.reduce(
      (count, effectId) => count + (this.cardsByEffect.get(effectId)?.size ?? 0),
      0,
    );
    if (availableCardCount < 3) {
      throw new Error(`offer ordinal ${offerOrdinal} has fewer than three eligible cards`);
    }
    this.eligibleEffectsByOrdinal.set(offerOrdinal, [...eligible]);
    return [...eligible];
  }

  private assertOfferOrdinal(offerOrdinal: number): void {
    if (!Number.isSafeInteger(offerOrdinal) || offerOrdinal < 1) {
      throw new Error(`offerOrdinal must be >= 1, received ${offerOrdinal}`);
    }
  }

  private validateOfferRequest(offerOrdinal: number, replacesOfferId?: string): void {
    if (replacesOfferId === undefined) {
      if (
        this.activeOfferByOrdinal.has(offerOrdinal) ||
        this.completedOfferOrdinals.has(offerOrdinal)
      ) {
        throw new Error(`offer ordinal ${offerOrdinal} was already granted`);
      }
      return;
    }

    const replacedOffer = this.offers.get(replacesOfferId);
    if (!replacedOffer) throw new Error(`cannot replace unknown offer ${replacesOfferId}`);
    const replacedOrdinal = this.offerOrdinals.get(replacesOfferId);
    if (replacedOrdinal !== offerOrdinal) {
      throw new Error(
        `offer ${replacesOfferId} belongs to ordinal ${String(replacedOrdinal)}, not ${offerOrdinal}`,
      );
    }
    if (this.activeOfferByOrdinal.get(offerOrdinal) !== replacesOfferId) {
      throw new Error(`offer ${replacesOfferId} is no longer active`);
    }
    if (
      this.acceptedChoices.has(replacesOfferId) ||
      this.completedOfferOrdinals.has(offerOrdinal)
    ) {
      throw new Error(`offer ordinal ${offerOrdinal} already has an accepted choice`);
    }
    if (this.rerolledOfferOrdinals.has(offerOrdinal)) {
      throw new Error(`offer ordinal ${offerOrdinal} has no rerolls remaining`);
    }
    if (
      (this.bundle.mode ?? 'fixed') === 'fixed' &&
      this.rerolledOfferOrdinals.size >= FIXED_CAMPAIGN_REROLL_BUDGET
    ) {
      throw new Error('campaign run has no rerolls remaining');
    }
  }

  private nextSequence(current: number, label: 'authority' | 'offer'): number {
    if (
      !Number.isSafeInteger(current) ||
      current < 0 ||
      current >= MAX_PERSISTED_SEQUENCE
    ) {
      throw new Error(`Local ${label} sequence is exhausted.`);
    }
    return current + 1;
  }

  private validateSnapshotEnvelope(snapshot: LocalAuthoritySnapshotV1): void {
    if (!isRecord(snapshot) || snapshot.schemaVersion !== 1) {
      throw new Error('Unsupported local authority snapshot schema.');
    }

    const hasAnyHeader =
      snapshot.releaseId !== undefined ||
      snapshot.configHash !== undefined ||
      snapshot.initialSeed !== undefined;
    if (hasAnyHeader && (
      snapshot.releaseId !== this.bundle.releaseId ||
      snapshot.configHash !== this.bundle.configHash ||
      !Number.isSafeInteger(snapshot.initialSeed) ||
      snapshot.initialSeed! < 0 ||
      snapshot.initialSeed! >= UINT32_MAX_PLUS_ONE
    )) {
      throw new Error('Local authority snapshot header does not match the supplied battle bundle.');
    }
    if (
      !Number.isSafeInteger(snapshot.rngState) ||
      snapshot.rngState <= 0 ||
      snapshot.rngState >= UINT32_MAX_PLUS_ONE
    ) {
      throw new Error('Local authority snapshot RNG state is invalid.');
    }
    if (
      !Number.isSafeInteger(snapshot.authoritySeq) ||
      snapshot.authoritySeq < 0 ||
      snapshot.authoritySeq > MAX_PERSISTED_SEQUENCE ||
      !Number.isSafeInteger(snapshot.offerSerial) ||
      snapshot.offerSerial < 0 ||
      snapshot.offerSerial > MAX_PERSISTED_SEQUENCE
    ) {
      throw new Error('Local authority snapshot sequence state is invalid.');
    }
    if (
      !Number.isSafeInteger(snapshot.offersSincePurple) ||
      snapshot.offersSincePurple < 0 ||
      (snapshot.purplePityAdvancedOnChoice === true &&
        snapshot.offersSincePurple > MAX_PURPLE_PITY) ||
      (snapshot.purplePityAdvancedOnChoice !== undefined &&
        snapshot.purplePityAdvancedOnChoice !== true) ||
      !Number.isSafeInteger(snapshot.consecutiveGreenSlots) ||
      snapshot.consecutiveGreenSlots < 0 ||
      snapshot.consecutiveGreenSlots > MAX_CONSECUTIVE_GREEN_SLOTS
    ) {
      throw new Error('Local authority snapshot pity state is invalid.');
    }
    if (
      !Array.isArray(snapshot.offers) ||
      !Array.isArray(snapshot.acceptedChoices) ||
      (snapshot.rerolledOfferOrdinals !== undefined &&
        !Array.isArray(snapshot.rerolledOfferOrdinals)) ||
      (snapshot.eligibleEffectsByOrdinal !== undefined &&
        !Array.isArray(snapshot.eligibleEffectsByOrdinal)) ||
      (snapshot.activeOfferByOrdinal !== undefined &&
        !Array.isArray(snapshot.activeOfferByOrdinal))
    ) {
      throw new Error('Local authority snapshot collections are invalid.');
    }
  }

  private restoreOfferState(snapshot: LocalAuthoritySnapshotV1): void {
    const allEffects = [...this.cardsByEffect.keys()];
    const eligibleOrdinals = new Set<number>();
    for (const entry of snapshot.eligibleEffectsByOrdinal ?? []) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error('Authority snapshot has a malformed eligible-effects entry.');
      }
      const [offerOrdinal, rawEffects] = entry;
      this.assertOfferOrdinal(offerOrdinal);
      if (eligibleOrdinals.has(offerOrdinal) || !Array.isArray(rawEffects)) {
        throw new Error(`snapshot has invalid eligible effects for ordinal ${offerOrdinal}`);
      }
      const effects = rawEffects as CardEffectId[];
      const normalized = allEffects.filter((effectId) => effects.includes(effectId));
      if (
        effects.length === 0 ||
        new Set(effects).size !== effects.length ||
        effects.some((effectId) => !this.cardsByEffect.has(effectId)) ||
        JSON.stringify(effects) !== JSON.stringify(normalized) ||
        normalized.reduce(
          (count, effectId) => count + (this.cardsByEffect.get(effectId)?.size ?? 0),
          0,
        ) < 3
      ) {
        throw new Error(`snapshot has invalid eligible effects for ordinal ${offerOrdinal}`);
      }
      eligibleOrdinals.add(offerOrdinal);
      this.eligibleEffectsByOrdinal.set(offerOrdinal, [...normalized]);
    }

    const authoritySequences = new Set<number>();
    const offerSerials = new Set<number>();
    for (const entry of snapshot.offers) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        !isRecord(entry[1])
      ) {
        throw new Error('Authority snapshot contains a malformed offer entry.');
      }
      const [id, rawEvent] = entry;
      if (
        rawEvent.type !== 'OFFER_GRANTED' ||
        typeof rawEvent.offerId !== 'string' ||
        rawEvent.offerId.length === 0 ||
        id !== rawEvent.offerId ||
        !Number.isSafeInteger(rawEvent.authoritySeq) ||
        (rawEvent.authoritySeq as number) <= 0 ||
        (rawEvent.authoritySeq as number) > snapshot.authoritySeq ||
        (rawEvent.authoritySeq as number) > MAX_PERSISTED_SEQUENCE ||
        rawEvent.authorizationId !== `practice-auth-${String(rawEvent.authoritySeq)}` ||
        (rawEvent.replacesOfferId !== undefined &&
          (typeof rawEvent.replacesOfferId !== 'string' || rawEvent.replacesOfferId.length === 0)) ||
        !Array.isArray(rawEvent.cards) ||
        rawEvent.cards.length !== 3 ||
        new Set(rawEvent.cards).size !== 3 ||
        rawEvent.cards.some(
          (cardId) => typeof cardId !== 'string' || !this.bundle.cards.some((card) => card.id === cardId),
        )
      ) {
        throw new Error(`Authority snapshot offer ${id} is malformed.`);
      }
      const event = copyOffer(rawEvent as unknown as OfferGranted);
      const identity = this.parseOfferIdentity(event.offerId);
      if (
        identity === undefined ||
        offerSerials.has(identity.serial) ||
        authoritySequences.has(event.authoritySeq)
      ) {
        throw new Error(`Authority snapshot offer ${event.offerId} has an invalid sequence.`);
      }
      offerSerials.add(identity.serial);
      authoritySequences.add(event.authoritySeq);
      const offerOrdinal = identity.ordinal;
      if (event.replacesOfferId === undefined && this.activeOfferByOrdinal.has(offerOrdinal)) {
        throw new Error(`snapshot contains duplicate root offers for ordinal ${offerOrdinal}`);
      }
      if (event.replacesOfferId !== undefined) {
        const replacedOffer = this.offers.get(event.replacesOfferId);
        const replacedIdentity = this.parseOfferIdentity(event.replacesOfferId);
        if (replacedOffer === undefined || replacedIdentity === undefined) {
          throw new Error(`snapshot offer ${event.offerId} has an invalid replacement chain`);
        }
        if (
          replacedIdentity.ordinal !== offerOrdinal ||
          this.activeOfferByOrdinal.get(offerOrdinal) !== event.replacesOfferId ||
          this.rerolledOfferOrdinals.has(offerOrdinal) ||
          event.authoritySeq <= replacedOffer.authoritySeq ||
          identity.serial <= replacedIdentity.serial
        ) {
          throw new Error(`snapshot offer ${event.offerId} replaces an inactive offer`);
        }
        this.rerolledOfferOrdinals.add(offerOrdinal);
      }
      this.offers.set(id, event);
      this.offerOrdinals.set(id, offerOrdinal);
      this.activeOfferByOrdinal.set(offerOrdinal, id);
    }

    const sortedOfferSerials = [...offerSerials].sort((left, right) => left - right);
    if (
      snapshot.offerSerial !== snapshot.offers.length ||
      sortedOfferSerials.some((serial, index) => serial !== index + 1)
    ) {
      throw new Error('Authority snapshot offer serial does not match its offer history.');
    }

    const offeredOrdinals = new Set(this.offerOrdinals.values());
    if (snapshot.eligibleEffectsByOrdinal === undefined) {
      for (const offerOrdinal of offeredOrdinals) {
        this.eligibleEffectsByOrdinal.set(offerOrdinal, [...allEffects]);
      }
    } else if (
      eligibleOrdinals.size !== offeredOrdinals.size ||
      [...eligibleOrdinals].some((offerOrdinal) => !offeredOrdinals.has(offerOrdinal))
    ) {
      throw new Error('Authority snapshot eligible effects do not match its offer ordinals.');
    }
    for (const [offerId, event] of this.offers) {
      const offerOrdinal = this.offerOrdinals.get(offerId);
      const eligible = offerOrdinal === undefined
        ? undefined
        : this.eligibleEffectsByOrdinal.get(offerOrdinal);
      if (
        eligible === undefined ||
        event.cards.some((cardId) => !eligible.includes(this.cardById(cardId).effectId))
      ) {
        throw new Error(`Authority snapshot offer ${offerId} violates its eligible effects.`);
      }
    }

    for (const entry of snapshot.acceptedChoices) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        !isRecord(entry[1])
      ) {
        throw new Error('Authority snapshot contains a malformed accepted-choice entry.');
      }
      const [id, rawEvent] = entry;
      if (
        rawEvent.type !== 'CARD_CHOICE_ACCEPTED' ||
        typeof rawEvent.offerId !== 'string' ||
        typeof rawEvent.cardId !== 'string' ||
        id !== rawEvent.offerId ||
        !Number.isSafeInteger(rawEvent.authoritySeq) ||
        (rawEvent.authoritySeq as number) <= 0 ||
        (rawEvent.authoritySeq as number) > snapshot.authoritySeq ||
        (rawEvent.authoritySeq as number) > MAX_PERSISTED_SEQUENCE ||
        rawEvent.authorizationId !== `practice-auth-${String(rawEvent.authoritySeq)}` ||
        authoritySequences.has(rawEvent.authoritySeq as number)
      ) {
        throw new Error(`Authority snapshot choice ${id} is malformed.`);
      }
      const event = copyChoice(rawEvent as unknown as CardChoiceAccepted);
      authoritySequences.add(event.authoritySeq);
      const offerOrdinal = this.offerOrdinals.get(event.offerId);
      if (offerOrdinal === undefined) {
        throw new Error(`snapshot choice references unknown offer ${event.offerId}`);
      }
      const offer = this.offers.get(event.offerId);
      if (!offer?.cards.includes(event.cardId)) {
        throw new Error(`snapshot choice ${event.cardId} is not in offer ${event.offerId}`);
      }
      if (
        this.activeOfferByOrdinal.get(offerOrdinal) !== event.offerId ||
        event.authoritySeq <= offer.authoritySeq
      ) {
        throw new Error(`snapshot choice references inactive offer ${event.offerId}`);
      }
      if (this.completedOfferOrdinals.has(offerOrdinal)) {
        throw new Error(`snapshot contains duplicate choices for ordinal ${offerOrdinal}`);
      }
      this.acceptedChoices.set(id, event);
      this.completedOfferOrdinals.add(offerOrdinal);
    }

    if (snapshot.rerolledOfferOrdinals !== undefined) {
      const persistedRerolls = new Set<number>();
      for (const offerOrdinal of snapshot.rerolledOfferOrdinals) {
        this.assertOfferOrdinal(offerOrdinal);
        if (persistedRerolls.has(offerOrdinal)) {
          throw new Error('Authority snapshot contains duplicate reroll ordinals.');
        }
        persistedRerolls.add(offerOrdinal);
      }
      if (
        persistedRerolls.size !== this.rerolledOfferOrdinals.size ||
        [...persistedRerolls].some((offerOrdinal) => !this.rerolledOfferOrdinals.has(offerOrdinal))
      ) {
        throw new Error('Authority snapshot rerolls do not match its replacement chains.');
      }
    }

    if (snapshot.activeOfferByOrdinal !== undefined) {
      const persistedActiveOffers = new Map<number, string>();
      for (const entry of snapshot.activeOfferByOrdinal) {
        if (
          !Array.isArray(entry) ||
          entry.length !== 2 ||
          !Number.isSafeInteger(entry[0]) ||
          entry[0] < 1 ||
          typeof entry[1] !== 'string' ||
          persistedActiveOffers.has(entry[0])
        ) {
          throw new Error('Authority snapshot contains an invalid active-offer entry.');
        }
        persistedActiveOffers.set(entry[0], entry[1]);
      }
      if (
        persistedActiveOffers.size !== this.activeOfferByOrdinal.size ||
        [...persistedActiveOffers].some(
          ([offerOrdinal, offerId]) => this.activeOfferByOrdinal.get(offerOrdinal) !== offerId,
        )
      ) {
        throw new Error('Authority snapshot active offers do not match its replacement chains.');
      }
    }
  }

  private deriveOffersSincePurple(): number {
    let offersSincePurple = 0;
    const choices = [...this.acceptedChoices.values()].sort(
      (left, right) => left.authoritySeq - right.authoritySeq,
    );
    for (const choice of choices) {
      const offer = this.offers.get(choice.offerId);
      if (!offer) throw new Error(`snapshot choice references unknown offer ${choice.offerId}`);
      const hasPurple = offer.cards.some((cardId) => this.cardById(cardId).quality === 'P');
      offersSincePurple = hasPurple ? 0 : offersSincePurple + 1;
    }
    return offersSincePurple;
  }

  private parseOfferIdentity(
    offerId: string,
  ): { ordinal: number; serial: number } | undefined {
    const match = /^practice-offer-(\d+)-(\d+)$/.exec(offerId);
    if (!match) return undefined;
    const offerOrdinal = Number(match[1]);
    const offerSerial = Number(match[2]);
    return Number.isSafeInteger(offerOrdinal) &&
      offerOrdinal >= 1 &&
      Number.isSafeInteger(offerSerial) &&
      offerSerial >= 1 &&
      offerSerial <= MAX_PERSISTED_SEQUENCE
      ? { ordinal: offerOrdinal, serial: offerSerial }
      : undefined;
  }

  private rollQuality(forcePurple: boolean): Quality {
    if (forcePurple) {
      this.consecutiveGreenSlots = 0;
      return 'P';
    }

    const roll = this.rng.nextInt(10_000);
    let quality: Quality = roll < 5_500 ? 'G' : roll < 9_000 ? 'B' : 'P';
    if (quality === 'G' && this.consecutiveGreenSlots >= 4) quality = 'B';
    this.consecutiveGreenSlots = quality === 'G' ? this.consecutiveGreenSlots + 1 : 0;
    return quality;
  }

  private uniqueCardFor(
    effectId: CardEffectId,
    requested: Quality,
    excludedCardIds: ReadonlySet<string>,
  ): CardDefinition {
    const qualities = this.cardsByEffect.get(effectId);
    if (!qualities) throw new Error(`unknown effect ${effectId}`);
    const requestedIndex = QUALITY_ORDER.indexOf(requested);
    const searchOrder = [
      ...QUALITY_ORDER.slice(0, requestedIndex + 1).reverse(),
      ...QUALITY_ORDER.slice(requestedIndex + 1),
    ];
    for (const quality of searchOrder) {
      const card = qualities.get(quality);
      if (card && !excludedCardIds.has(card.id)) return card;
    }
    throw new Error(`effect ${effectId} has no remaining compatible card for ${requested}`);
  }

  private cardFor(effectId: CardEffectId, requested: Quality): CardDefinition {
    const qualities = this.cardsByEffect.get(effectId);
    if (!qualities) throw new Error(`unknown effect ${effectId}`);
    const requestedIndex = QUALITY_ORDER.indexOf(requested);
    for (let index = requestedIndex; index >= 0; index -= 1) {
      const quality = QUALITY_ORDER[index];
      if (!quality) continue;
      const card = qualities.get(quality);
      if (card) return card;
    }
    throw new Error(`effect ${effectId} has no compatible card for ${requested}`);
  }

  private cardById(cardId: string): CardDefinition {
    const card = this.bundle.cards.find((candidate) => candidate.id === cardId);
    if (!card) throw new Error(`unknown card ${cardId}`);
    return card;
  }
}
