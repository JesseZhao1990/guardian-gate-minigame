import {
  createBattleSimulation,
  type BattleSimulation,
  type SimulationOutput,
} from './core/battle-sim';
import {
  completeCampaignStage,
  createDefaultCampaignProgress,
  isStageUnlocked,
  nextStageId,
  selectCampaignStage,
  type CampaignProgressV1,
} from './core/campaign';
import { STAGE_BUNDLES, STAGE_ORDER } from './core/content';
import {
  type BattleCommand,
  type BattleStageId,
  type HudProjectionV1,
  type RenderSnapshotV1,
  type TowerId,
} from './core/contracts';
import { LocalPracticeAuthority } from './core/local-authority';
import {
  checkpointChecksum,
  createMiniGameRuntime,
  decodeText,
  encodeText,
  MiniGameAudio,
  MiniGameCampaignStore,
  MiniGameSaveStore,
  type SavedBattleV2,
} from './platform/wechat';
import {
  CanvasRenderer,
  type DesignPoint,
  type InteractionId,
} from './render/CanvasRenderer';

type Screen = 'loading' | 'home' | 'battle';
type WithoutSequence<T> = T extends unknown ? Omit<T, 'seq'> : never;
type BattleCommandWithoutSequence = WithoutSequence<BattleCommand>;

const SAVE_INTERVAL_TICKS = 450;
const AIM_SEND_INTERVAL_MS = 33;
const AIM_DRAG_THRESHOLD_PX = 18;

export class GuardianGateGame {
  private readonly runtime = createMiniGameRuntime();
  private readonly renderer = new CanvasRenderer(this.runtime, STAGE_BUNDLES.STAGE_01);
  private readonly store = new MiniGameSaveStore();
  private readonly campaignStore = new MiniGameCampaignStore();
  private readonly audio = new MiniGameAudio();
  private campaign: CampaignProgressV1 = createDefaultCampaignProgress();
  private readonly savedBattles = new Map<BattleStageId, SavedBattleV2>();
  private selectedStageId: BattleStageId = 'STAGE_01';
  private activeStageId: BattleStageId = 'STAGE_01';
  private pendingNextStageId?: BattleStageId;
  private screen: Screen = 'loading';
  private simulation?: BattleSimulation;
  private authority?: LocalPracticeAuthority;
  private seed = 1;
  private hud?: HudProjectionV1;
  private snapshot?: RenderSnapshotV1;
  private snapshotSequence = 0;
  private commandSequence = 1_000_000;
  private lastFrameAt = Date.now();
  private lastAimSentAt = 0;
  private lastSavedTick = 0;
  private currentOfferOrdinal = 1;
  private reviveOrdinal?: number;
  private selectedTowerId: TowerId = 0;
  private aimingTowerId?: TowerId;
  private activeTouchId?: number;
  private aimPoint?: DesignPoint;
  private aimDragOrigin?: DesignPoint;
  private aimDragActivated = false;
  private victory = false;
  private fatalError?: string;
  private disposed = false;

  constructor() {
    this.bindRuntimeEvents();
    this.renderer.drawLoading();
    void this.initialize();
    this.runtime.requestFrame(this.frame);
  }

  private async initialize(): Promise<void> {
    try {
      await this.renderer.loadAssets();
      this.campaign = this.campaignStore.load();
      this.selectedStageId = this.campaign.selectedStageId;
      this.refreshSavedBattles();
      this.restoreCampaignSelection();
      this.screen = 'home';
    } catch (error) {
      this.fatalError = error instanceof Error ? error.message : String(error);
      this.screen = 'home';
    }
  }

  private readonly frame = (_timestamp: number): void => {
    if (this.disposed) return;
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(now - this.lastFrameAt, 100));
    this.lastFrameAt = now;

    if (this.screen === 'battle' && this.simulation) {
      try {
        if (this.simulation.getHudProjection().flowState === 'running') {
          this.processOutput(this.simulation.advanceWallTime(elapsed));
        }
        this.refreshBattleProjection();
        if (this.hud && this.hud.tick - this.lastSavedTick >= SAVE_INTERVAL_TICKS) {
          this.saveBattle();
        }
      } catch (error) {
        this.fatalError = error instanceof Error ? error.message : String(error);
      }
    }

    this.render();
    this.runtime.requestFrame(this.frame);
  };

  private render(): void {
    if (this.screen === 'loading') {
      this.renderer.drawLoading();
      return;
    }
    if (this.screen === 'home') {
      this.renderer.drawHome({
        selectedStageId: this.selectedStageId,
        stages: STAGE_ORDER.map((stageId) => {
          const saved = this.savedBattles.get(stageId);
          return {
            id: stageId,
            name: STAGE_BUNDLES[stageId].stage.name,
            unlocked: isStageUnlocked(this.campaign, stageId),
            completed: this.campaign.completedStageIds.includes(stageId),
            ...(saved ? { resumeTick: saved.tick } : {}),
          };
        }),
      });
      return;
    }
    if (!this.hud || !this.snapshot) {
      this.renderer.drawLoading('正在启动战斗演算…');
      return;
    }
    this.renderer.drawBattle({
      snapshot: this.snapshot,
      hud: this.hud,
      muted: this.audio.isMuted(),
      selectedTowerId: this.selectedTowerId,
      ...(this.aimingTowerId !== undefined ? { aimingTowerId: this.aimingTowerId } : {}),
      ...(this.aimPoint ? { aimPoint: this.aimPoint } : {}),
      ...(this.reviveOrdinal !== undefined ? { reviveOrdinal: this.reviveOrdinal } : {}),
      victory: this.victory,
      ...(this.pendingNextStageId
        ? { nextStageName: STAGE_BUNDLES[this.pendingNextStageId].stage.name }
        : {}),
      ...(this.fatalError ? { error: this.fatalError } : {}),
    });
  }

  private startNewBattle(stageId: BattleStageId = this.selectedStageId): void {
    if (!isStageUnlocked(this.campaign, stageId)) return;
    this.store.clear(stageId);
    this.savedBattles.delete(stageId);
    this.startBattle(stageId);
  }

  private continueBattle(stageId: BattleStageId = this.selectedStageId): void {
    if (!isStageUnlocked(this.campaign, stageId)) return;
    const saved = this.savedBattles.get(stageId);
    if (!saved) {
      this.startNewBattle(stageId);
      return;
    }
    this.startBattle(stageId, saved);
  }

  private startBattle(stageId: BattleStageId, saved?: SavedBattleV2): void {
    if (!isStageUnlocked(this.campaign, stageId)) return;
    const bundle = STAGE_BUNDLES[stageId];
    try {
      this.activeStageId = stageId;
      this.selectStage(stageId);
      this.seed = saved?.seed ?? this.makeSeed();
      this.simulation = createBattleSimulation(
        bundle,
        this.seed,
        saved ? encodeText(saved.checkpointText) : undefined,
      );
      this.authority = new LocalPracticeAuthority(
        bundle,
        this.seed,
        saved?.authoritySnapshot,
      );
      this.commandSequence = 1_000_000 + this.simulation.getHudProjection().tick;
      this.snapshotSequence = 0;
      this.lastSavedTick = saved?.tick ?? 0;
      this.currentOfferOrdinal = Math.max(1, this.simulation.getHudProjection().level);
      this.reviveOrdinal = this.simulation.getHudProjection().flowState === 'defeat-pending'
        ? this.simulation.getHudProjection().revivesUsed + 1
        : undefined;
      this.victory = this.simulation.getHudProjection().flowState === 'result';
      this.pendingNextStageId = this.victory ? nextStageId(stageId) : undefined;
      this.fatalError = undefined;
      this.selectedTowerId = 0;
      this.aimingTowerId = undefined;
      this.activeTouchId = undefined;
      this.aimPoint = undefined;
      this.aimDragOrigin = undefined;
      this.aimDragActivated = false;
      this.screen = 'battle';
      this.lastFrameAt = Date.now();
      this.refreshBattleProjection();
      this.audio.start();
    } catch (error) {
      this.store.clear(stageId);
      this.savedBattles.delete(stageId);
      this.screen = 'home';
      this.renderer.setBundle(STAGE_BUNDLES[this.selectedStageId]);
      this.fatalError = error instanceof Error ? error.message : String(error);
    }
  }

  private refreshBattleProjection(): void {
    if (!this.simulation) return;
    this.hud = this.simulation.getHudProjection();
    this.snapshotSequence += 1;
    this.snapshot = this.simulation.getRenderSnapshot(1, this.snapshotSequence);
    if (this.hud.activeOffer) this.currentOfferOrdinal = Math.max(1, this.hud.level);
    if (this.hud.flowState === 'defeat-pending' && this.reviveOrdinal === undefined) {
      this.reviveOrdinal = this.hud.revivesUsed + 1;
    }
  }

  private processOutput(initial: SimulationOutput): void {
    if (!this.simulation || !this.authority) return;
    const pending = [initial];
    while (pending.length > 0) {
      const output = pending.shift();
      if (!output) continue;
      if (output.events.length > 0) {
        const snapshot = this.simulation.getRenderSnapshot(1, ++this.snapshotSequence);
        this.renderer.pushEvents(output.events, snapshot);
        this.audio.playEvents(output.events);
        if (!this.victory && output.events.some((event) => event.type === 'VICTORY')) {
          const now = Date.now();
          this.campaign = completeCampaignStage(this.campaign, this.activeStageId, now);
          const next = nextStageId(this.activeStageId);
          if (next && isStageUnlocked(this.campaign, next)) {
            this.campaign = selectCampaignStage(this.campaign, next, now);
            this.selectedStageId = next;
            this.pendingNextStageId = next;
          } else {
            this.pendingNextStageId = undefined;
          }
          this.campaign = this.campaignStore.save(this.campaign);
          this.victory = true;
          this.store.clear(this.activeStageId);
          this.savedBattles.delete(this.activeStageId);
        }
      }
      for (const request of output.flowRequests) {
        if (request.type === 'OFFER') {
          this.currentOfferOrdinal = request.ordinal;
          pending.push(this.simulation.applyAuthorityEvent(this.authority.requestOffer(request.ordinal)));
        } else {
          this.reviveOrdinal = request.ordinal;
        }
      }
    }
  }

  private issueCommand(command: BattleCommandWithoutSequence): void {
    if (!this.simulation) return;
    this.commandSequence += 1;
    this.processOutput(this.simulation.applyCommand({ ...command, seq: this.commandSequence } as BattleCommand));
    this.refreshBattleProjection();
  }

  private chooseCard(cardId: string): void {
    if (!this.simulation || !this.authority || !this.hud?.activeOffer) return;
    try {
      this.processOutput(
        this.simulation.applyAuthorityEvent(
          this.authority.acceptChoice(this.hud.activeOffer.offerId, cardId),
        ),
      );
      this.refreshBattleProjection();
      wx.vibrateShort?.({ type: 'light' });
    } catch (error) {
      this.fatalError = error instanceof Error ? error.message : String(error);
    }
  }

  private rerollCards(): void {
    if (!this.simulation || !this.authority || !this.hud?.activeOffer) return;
    try {
      this.processOutput(
        this.simulation.applyAuthorityEvent(
          this.authority.requestOffer(this.currentOfferOrdinal, this.hud.activeOffer.offerId),
        ),
      );
      this.refreshBattleProjection();
    } catch (error) {
      this.fatalError = error instanceof Error ? error.message : String(error);
    }
  }

  private revive(): void {
    if (!this.simulation || !this.authority || this.reviveOrdinal === undefined) return;
    try {
      this.processOutput(
        this.simulation.applyAuthorityEvent(this.authority.grantRevive(this.reviveOrdinal)),
      );
      this.reviveOrdinal = undefined;
      this.refreshBattleProjection();
      wx.vibrateShort?.({ type: 'medium' });
    } catch (error) {
      this.fatalError = error instanceof Error ? error.message : String(error);
    }
  }

  private updateAim(point: DesignPoint, towerId: TowerId): void {
    if (!this.simulation || this.hud?.flowState !== 'running') return;
    const clamped = {
      x: Math.max(0, Math.min(1920, point.x)),
      y: Math.max(0, Math.min(1080, point.y)),
    };
    const anchor = STAGE_BUNDLES[this.activeStageId].route.towerAnchors[towerId];
    const deltaX = clamped.x - anchor.x;
    const deltaY = clamped.y - anchor.y;
    if (deltaX * deltaX + deltaY * deltaY < 72 * 72) {
      this.aimPoint = undefined;
      return;
    }
    this.aimPoint = clamped;
    const now = Date.now();
    if (now - this.lastAimSentAt < AIM_SEND_INTERVAL_MS) return;
    this.lastAimSentAt = now;
    const angle = Math.atan2(deltaY, deltaX);
    const angleU16 = Math.round(((angle / (Math.PI * 2) + 1) % 1) * 65_536) & 0xffff;
    this.issueCommand({ type: 'SET_AIM', towerId, angleU16 });
  }

  private handleInteraction(id: InteractionId): void {
    this.audio.start();
    if (id.startsWith('home-stage:')) {
      const stageId = id.slice('home-stage:'.length) as BattleStageId;
      if (STAGE_ORDER.includes(stageId)) this.selectStage(stageId);
    } else if (id === 'home-start' || id === 'home-new') {
      this.startNewBattle(this.selectedStageId);
    } else if (id === 'overlay-retry') {
      this.startNewBattle(this.activeStageId);
    } else if (id === 'overlay-next' && this.pendingNextStageId) {
      this.startNewBattle(this.pendingNextStageId);
    } else if (id === 'home-continue') {
      this.continueBattle(this.selectedStageId);
    } else if (id === 'hud-back' || id === 'overlay-exit') {
      this.exitToHome();
    } else if (id === 'hud-speed' && this.hud) {
      this.issueCommand({ type: 'SET_SPEED', value: this.hud.speed === 1 ? 2 : 1 });
    } else if (id === 'hud-pause') {
      if (this.hud?.flowState === 'running') this.issueCommand({ type: 'PAUSE' });
      else if (this.hud?.flowState === 'paused') this.issueCommand({ type: 'RESUME' });
    } else if (id === 'hud-mute') {
      this.audio.setMuted(!this.audio.isMuted());
    } else if (id === 'overlay-resume') {
      this.issueCommand({ type: 'RESUME' });
    } else if (id === 'overlay-revive') {
      this.revive();
    } else if (id === 'card-reroll') {
      this.rerollCards();
    } else if (id.startsWith('card:')) {
      this.chooseCard(id.slice('card:'.length));
    }
  }

  private exitToHome(): void {
    if (this.simulation && !this.victory && !this.fatalError) this.saveBattle();
    this.audio.suspend();
    this.screen = 'home';
    this.selectedTowerId = 0;
    this.aimingTowerId = undefined;
    this.activeTouchId = undefined;
    this.aimPoint = undefined;
    this.aimDragOrigin = undefined;
    this.aimDragActivated = false;
    this.refreshSavedBattles();
    this.restoreCampaignSelection();
  }

  private saveBattle(): void {
    if (!this.simulation || !this.authority || this.victory) return;
    try {
      const hud = this.simulation.getHudProjection();
      const checkpointText = decodeText(this.simulation.createCheckpoint());
      const saved: SavedBattleV2 = {
        schemaVersion: 2,
        stageId: this.activeStageId,
        configHash: STAGE_BUNDLES[this.activeStageId].configHash,
        seed: this.seed,
        tick: hud.tick,
        savedAt: Date.now(),
        checkpointText,
        checkpointChecksum: checkpointChecksum(checkpointText),
        authoritySnapshot: this.authority.snapshot(),
      };
      this.store.save(saved);
      this.savedBattles.set(this.activeStageId, saved);
      this.lastSavedTick = hud.tick;
    } catch (error) {
      console.warn('练习局快照生成失败', error);
    }
  }

  private refreshSavedBattles(): void {
    this.savedBattles.clear();
    for (const stageId of STAGE_ORDER) {
      const bundle = STAGE_BUNDLES[stageId];
      const candidate = this.store.load(stageId, bundle.configHash);
      if (!candidate) continue;
      try {
        createBattleSimulation(bundle, candidate.seed, encodeText(candidate.checkpointText));
        this.savedBattles.set(stageId, candidate);
      } catch {
        this.store.clear(stageId);
      }
    }

    const highestSavedStageIndex = STAGE_ORDER.reduce(
      (highest, stageId, index) => this.savedBattles.has(stageId) ? Math.max(highest, index) : highest,
      0,
    );
    let repairedProgress = false;
    for (let index = 0; index < highestSavedStageIndex; index += 1) {
      const prerequisite = STAGE_ORDER[index];
      if (!prerequisite || this.campaign.completedStageIds.includes(prerequisite)) continue;
      this.campaign = completeCampaignStage(this.campaign, prerequisite, Date.now());
      repairedProgress = true;
    }
    if (repairedProgress) {
      this.campaign = this.campaignStore.save(this.campaign);
    }
  }

  private selectStage(stageId: BattleStageId): void {
    if (!isStageUnlocked(this.campaign, stageId)) return;
    this.campaign = selectCampaignStage(this.campaign, stageId, Date.now());
    this.campaign = this.campaignStore.save(this.campaign);
    this.selectedStageId = stageId;
    this.renderer.setBundle(STAGE_BUNDLES[stageId]);
    this.fatalError = undefined;
  }

  private restoreCampaignSelection(): void {
    const preferred = isStageUnlocked(this.campaign, this.campaign.selectedStageId)
      ? this.campaign.selectedStageId
      : 'STAGE_01';
    this.selectedStageId = preferred;
    this.renderer.setBundle(STAGE_BUNDLES[preferred]);
  }

  private makeSeed(): number {
    const globals = globalThis as typeof globalThis & { crypto?: Crypto };
    if (globals.crypto?.getRandomValues) {
      return globals.crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffff_ffff)) >>> 0 || 1;
  }

  private bindRuntimeEvents(): void {
    wx.onTouchStart((event) => {
      if (this.activeTouchId !== undefined) return;
      const touch = event.changedTouches?.[0] ?? event.touches?.[0];
      if (!touch) return;
      const point = this.touchPoint(touch);
      const interaction = this.renderer.hitTest(point);
      if (interaction) {
        this.handleInteraction(interaction);
        return;
      }
      if (this.screen !== 'battle' || this.hud?.flowState !== 'running' || this.victory || this.fatalError) return;
      if (!this.renderer.containsDesignPoint(point)) return;
      this.audio.start();
      const selectedTower = this.renderer.hitTestTower(point);
      if (selectedTower === undefined && this.renderer.isBattleHudPoint(point)) return;
      if (selectedTower !== undefined) {
        if (selectedTower !== this.selectedTowerId) wx.vibrateShort?.({ type: 'light' });
        this.selectedTowerId = selectedTower;
      }
      this.aimingTowerId = this.selectedTowerId;
      this.activeTouchId = this.touchIdentifier(touch);
      this.lastAimSentAt = 0;
      this.aimDragOrigin = point;
      this.aimDragActivated = false;
    });

    wx.onTouchMove((event) => {
      if (this.aimingTowerId === undefined || this.activeTouchId === undefined) return;
      const touch = this.findActiveTouch(event);
      if (!touch) return;
      const point = this.touchPoint(touch);
      if (!this.aimDragActivated) {
        const origin = this.aimDragOrigin ?? point;
        const deltaX = point.x - origin.x;
        const deltaY = point.y - origin.y;
        if (deltaX * deltaX + deltaY * deltaY < AIM_DRAG_THRESHOLD_PX * AIM_DRAG_THRESHOLD_PX) {
          return;
        }
        this.aimDragActivated = true;
      }
      this.updateAim(point, this.aimingTowerId);
    });

    const endAim = (event?: any) => {
      if (this.activeTouchId !== undefined && event?.changedTouches?.length) {
        const activeEnded = Array.from(event.changedTouches as ArrayLike<any>)
          .some((touch) => this.touchIdentifier(touch) === this.activeTouchId);
        if (!activeEnded) return;
      }
      this.aimingTowerId = undefined;
      this.activeTouchId = undefined;
      this.aimPoint = undefined;
      this.aimDragOrigin = undefined;
      this.aimDragActivated = false;
    };
    wx.onTouchEnd(endAim);
    wx.onTouchCancel(endAim);

    wx.onHide(() => {
      endAim();
      if (this.screen === 'battle' && this.simulation) {
        if (this.simulation.getHudProjection().flowState === 'running') {
          this.issueCommand({ type: 'PAUSE' });
        }
        this.saveBattle();
      }
      this.campaign = this.campaignStore.save(this.campaign);
      this.audio.suspend();
    });

    wx.onShow(() => {
      this.lastFrameAt = Date.now();
      this.audio.resume();
    });

    wx.onWindowResize?.(() => {
      this.renderer.resize();
      this.lastFrameAt = Date.now();
    });

    wx.onAudioInterruptionBegin?.(() => this.audio.suspend());
    wx.onAudioInterruptionEnd?.(() => this.audio.resume());
  }

  private touchPoint(touch: any): DesignPoint {
    const clientX = touch.clientX ?? touch.x ?? touch.pageX ?? 0;
    const clientY = touch.clientY ?? touch.y ?? touch.pageY ?? 0;
    return this.renderer.toDesignPoint(clientX, clientY);
  }

  private touchIdentifier(touch: any): number {
    return Number.isInteger(touch?.identifier) ? touch.identifier : 0;
  }

  private findActiveTouch(event: any): any | undefined {
    const candidates = [
      ...Array.from((event.touches ?? []) as ArrayLike<any>),
      ...Array.from((event.changedTouches ?? []) as ArrayLike<any>),
    ];
    return candidates.find((touch) => this.touchIdentifier(touch) === this.activeTouchId);
  }
}
