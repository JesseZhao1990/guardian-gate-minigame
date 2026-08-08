import type {
  BattleBundleV1,
  CardChoiceAccepted,
  CardDefinition,
  OfferGranted,
  ReviveGranted,
} from './contracts';

export interface LocalAuthoritySnapshotV1 {
  schemaVersion: 1;
  rngState: number;
  authoritySeq: number;
  offerSerial: number;
  offersSincePurple: number;
  consecutiveGreenSlots: number;
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

export class LocalPracticeAuthority {
  private readonly bundle: BattleBundleV1;
  private readonly rng: XorShift32;
  private readonly cardsByEffect = new Map<string, Map<Quality, CardDefinition>>();
  private readonly offers = new Map<string, OfferGranted>();
  private readonly acceptedChoices = new Map<string, CardChoiceAccepted>();
  private authoritySeq = 0;
  private offerSerial = 0;
  private offersSincePurple = 0;
  private consecutiveGreenSlots = 0;

  constructor(bundle: BattleBundleV1, seed: number, snapshot?: LocalAuthoritySnapshotV1) {
    this.bundle = bundle;
    this.rng = new XorShift32(snapshot?.rngState ?? (seed ^ 0xa341316c));
    for (const card of bundle.cards) {
      const qualities = this.cardsByEffect.get(card.effectId) ?? new Map<Quality, CardDefinition>();
      qualities.set(card.quality, card);
      this.cardsByEffect.set(card.effectId, qualities);
    }

    if (this.cardsByEffect.size < 3) {
      throw new Error('LocalPracticeAuthority requires at least three distinct card effects');
    }

    if (snapshot) {
      this.authoritySeq = snapshot.authoritySeq;
      this.offerSerial = snapshot.offerSerial;
      this.offersSincePurple = snapshot.offersSincePurple;
      this.consecutiveGreenSlots = snapshot.consecutiveGreenSlots;
      for (const [id, event] of snapshot.offers) this.offers.set(id, event);
      for (const [id, event] of snapshot.acceptedChoices) this.acceptedChoices.set(id, event);
    }
  }

  requestOffer(offerOrdinal: number, replacesOfferId?: string): OfferGranted {
    if (!Number.isSafeInteger(offerOrdinal) || offerOrdinal < 1) {
      throw new Error(`offerOrdinal must be >= 1, received ${offerOrdinal}`);
    }

    const effects = [...this.cardsByEffect.keys()];
    const selectedEffects: string[] = [];
    while (selectedEffects.length < 3) {
      const index = this.rng.nextInt(effects.length);
      const [effect] = effects.splice(index, 1);
      if (effect) selectedEffects.push(effect);
    }

    const forcePurple = this.offersSincePurple >= 9;
    const selectedCards = selectedEffects.map((effectId, slotIndex) => {
      const quality = this.rollQuality(forcePurple && slotIndex === 0);
      return this.cardFor(effectId, quality).id;
    }) as [string, string, string];

    const hasPurple = selectedCards.some((cardId) => this.cardById(cardId).quality === 'P');
    this.offersSincePurple = hasPurple ? 0 : this.offersSincePurple + 1;
    this.offerSerial += 1;
    const offerId = `practice-offer-${offerOrdinal}-${this.offerSerial}`;
    const event: OfferGranted = {
      type: 'OFFER_GRANTED',
      authoritySeq: ++this.authoritySeq,
      authorizationId: `practice-auth-${this.authoritySeq}`,
      offerId,
      ...(replacesOfferId ? { replacesOfferId } : {}),
      cards: selectedCards,
    };
    this.offers.set(offerId, event);
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

    const event: CardChoiceAccepted = {
      type: 'CARD_CHOICE_ACCEPTED',
      authoritySeq: ++this.authoritySeq,
      authorizationId: `practice-auth-${this.authoritySeq}`,
      offerId,
      cardId,
    };
    this.acceptedChoices.set(offerId, event);
    return event;
  }

  grantRevive(reviveOrdinal: number): ReviveGranted {
    if (!Number.isSafeInteger(reviveOrdinal) || reviveOrdinal < 1 || reviveOrdinal > this.bundle.rules.maxRevives) {
      throw new Error(`invalid revive ordinal ${reviveOrdinal}`);
    }
    return {
      type: 'REVIVE_GRANTED',
      authoritySeq: ++this.authoritySeq,
      authorizationId: `practice-auth-${this.authoritySeq}`,
      reviveOrdinal,
    };
  }

  snapshot(): LocalAuthoritySnapshotV1 {
    return {
      schemaVersion: 1,
      rngState: this.rng.state,
      authoritySeq: this.authoritySeq,
      offerSerial: this.offerSerial,
      offersSincePurple: this.offersSincePurple,
      consecutiveGreenSlots: this.consecutiveGreenSlots,
      acceptedChoices: [...this.acceptedChoices.entries()],
      offers: [...this.offers.entries()],
    };
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

  private cardFor(effectId: string, requested: Quality): CardDefinition {
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
