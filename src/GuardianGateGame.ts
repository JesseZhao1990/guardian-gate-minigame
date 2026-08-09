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
import { resolveStageBundleForSeed, STAGE_BUNDLES, STAGE_ORDER } from './core/content';
import {
  type BattleBundleV1,
  type BattleCommand,
  type BattleEvent,
  type BattleStageId,
  type EndlessScoreV1,
  type EndlessSettlementReason,
  type HudProjectionV1,
  type RenderSnapshotV1,
  TICKS_PER_SECOND,
  type TowerId,
} from './core/contracts';
import { LocalPracticeAuthority } from './core/local-authority';
import {
  checkpointChecksum,
  compareEndlessRecords,
  createMiniGameRuntime,
  decodeText,
  encodeText,
  MiniGameAudio,
  MiniGameCampaignStore,
  MiniGameEndlessRecordStore,
  MiniGameSaveStore,
  type EndlessRecordV1,
  type SavedBattleV2,
} from './platform/wechat';
import {
  CanvasRenderer,
  type DesignPoint,
  type InteractionId,
  type TowerMetricRenderState,
} from './render/CanvasRenderer';

type Screen = 'loading' | 'home' | 'battle';
type WithoutSequence<T> = T extends unknown ? Omit<T, 'seq'> : never;
type BattleCommandWithoutSequence = WithoutSequence<BattleCommand>;

const SAVE_INTERVAL_TICKS = 450;
const AIM_SEND_INTERVAL_MS = 33;
const AIM_DRAG_THRESHOLD_PX = 18;
const DAMAGE_METRIC_WINDOW_TICKS = TICKS_PER_SECOND * 3;

interface TowerDamageBucket {
  tick: number;
  damageByTowerMilli: [number, number, number];
}

export class GuardianGateGame {
  private readonly runtime = createMiniGameRuntime();
  private readonly renderer = new CanvasRenderer(this.runtime, STAGE_BUNDLES.STAGE_01);
  private readonly store = new MiniGameSaveStore();
  private readonly campaignStore = new MiniGameCampaignStore();
  private readonly endlessRecordStore = new MiniGameEndlessRecordStore();
  private readonly audio = new MiniGameAudio();
  private campaign: CampaignProgressV1 = createDefaultCampaignProgress();
  private readonly savedBattles = new Map<BattleStageId, SavedBattleV2>();
  private selectedStageId: BattleStageId = 'STAGE_01';
  private activeStageId: BattleStageId = 'STAGE_01';
  private activeBundle: BattleBundleV1 = STAGE_BUNDLES.STAGE_01;
  private renderedStageId: BattleStageId = 'STAGE_01';
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
  private towerDamageBuckets: TowerDamageBucket[] = [];
  private strategyPanelOpen = false;
  private strategyPanelResumeOnClose = false;
  private loadingMessage = '正在校验关卡与原创资产…';
  private loadingProgress?: number;
  private homeError?: string;
  private stageLoadGeneration = 0;
  private stageLoadTargetId?: BattleStageId;
  private endlessBestRecords: EndlessRecordV1[] = [];
  private endlessResult?: EndlessRecordV1;
  private endlessPreviousBest?: EndlessRecordV1;
  private endlessIsNewBest?: boolean;
  private endlessSettlementReason?: EndlessSettlementReason;
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
      this.refreshEndlessRecords();
      this.refreshSavedBattles();
      await this.restoreCampaignSelection();
    } catch (error) {
      this.showStageBundle('STAGE_01');
      this.selectedStageId = 'STAGE_01';
      this.homeError = `资源初始化失败：${this.errorMessage(error)}`;
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
        if (this.hud?.flowState === 'running') {
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
      this.renderer.drawLoading(this.loadingMessage, this.loadingProgress);
      return;
    }
    if (this.screen === 'home') {
      this.renderer.drawHome({
        selectedStageId: this.selectedStageId,
        ...(this.homeError ? { error: this.homeError } : {}),
        stages: STAGE_ORDER.map((stageId) => {
          const saved = this.savedBattles.get(stageId);
          return {
            id: stageId,
            name: STAGE_BUNDLES[stageId].stage.name,
            unlocked: isStageUnlocked(this.campaign, stageId),
            completed: this.campaign.completedStageIds.includes(stageId),
            ...(saved ? { resumeTick: saved.tick } : {}),
            ...(stageId === 'STAGE_08' ? { best: this.endlessBestRecords } : {}),
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
      towerMetrics: this.getTowerMetrics(),
      strategyPanelOpen: this.strategyPanelOpen,
      ...(this.hud.activeOffer && this.authority
        ? { rerollsRemaining: this.authority.getRerollsRemaining(this.currentOfferOrdinal) }
        : {}),
      ...(this.aimingTowerId !== undefined ? { aimingTowerId: this.aimingTowerId } : {}),
      ...(this.aimPoint ? { aimPoint: this.aimPoint } : {}),
      ...(this.reviveOrdinal !== undefined ? { reviveOrdinal: this.reviveOrdinal } : {}),
      victory: this.victory,
      ...(this.endlessResult ? { endlessResult: this.endlessResult } : {}),
      ...(this.endlessPreviousBest ? { endlessPreviousBest: this.endlessPreviousBest } : {}),
      ...(this.endlessIsNewBest !== undefined ? { endlessIsNewBest: this.endlessIsNewBest } : {}),
      ...(this.endlessSettlementReason
        ? { endlessSettlementReason: this.endlessSettlementReason }
        : {}),
      ...(this.pendingNextStageId
        ? { nextStageName: STAGE_BUNDLES[this.pendingNextStageId].stage.name }
        : {}),
      ...(this.fatalError ? { error: this.fatalError } : {}),
    });
  }

  private startNewBattle(stageId: BattleStageId = this.selectedStageId): void {
    if (!isStageUnlocked(this.campaign, stageId)) return;
    void this.prepareBattle(stageId, undefined, true);
  }

  private continueBattle(stageId: BattleStageId = this.selectedStageId): void {
    if (!isStageUnlocked(this.campaign, stageId)) return;
    const saved = this.savedBattles.get(stageId);
    if (!saved) {
      this.startNewBattle(stageId);
      return;
    }
    void this.prepareBattle(stageId, saved, false);
  }

  private async prepareBattle(
    stageId: BattleStageId,
    saved: SavedBattleV2 | undefined,
    clearExistingSave: boolean,
  ): Promise<void> {
    if (!isStageUnlocked(this.campaign, stageId)) return;
    const seed = saved?.seed ?? this.makeSeed();
    let bundle: BattleBundleV1;
    try {
      bundle = resolveStageBundleForSeed(stageId, seed);
    } catch (error) {
      this.homeError = `关卡配置解析失败：${this.errorMessage(error)}`;
      this.loadingProgress = undefined;
      this.screen = 'home';
      return;
    }
    const generation = ++this.stageLoadGeneration;
    this.stageLoadTargetId = stageId;
    const previousRenderedStageId = this.renderedStageId;
    this.loadingMessage = `正在准备${bundle.stage.name}…`;
    this.loadingProgress = 0;
    this.homeError = undefined;
    this.screen = 'loading';
    try {
      await this.renderer.loadStageAssets(stageId, (progress) => {
        if (generation === this.stageLoadGeneration) this.loadingProgress = progress;
      });
      if (generation !== this.stageLoadGeneration || this.disposed) {
        this.releaseStaleStageLoad(stageId);
        return;
      }
      this.stageLoadTargetId = undefined;
      if (clearExistingSave) {
        this.store.clear(stageId);
        this.savedBattles.delete(stageId);
      }
      this.startBattle(bundle, seed, saved);
    } catch (error) {
      if (generation !== this.stageLoadGeneration || this.disposed) {
        this.releaseStaleStageLoad(stageId);
        return;
      }
      this.stageLoadTargetId = undefined;
      this.loadingProgress = undefined;
      this.renderer.releaseStageAssets(stageId);
      this.showStageBundle('STAGE_01');
      if (previousRenderedStageId !== 'STAGE_01') {
        this.renderer.releaseStageAssets(previousRenderedStageId);
      }
      this.homeError = `关卡资源加载失败：${this.errorMessage(error)}。存档已保留`;
      this.screen = 'home';
    }
  }

  private startBattle(bundle: BattleBundleV1, seed: number, saved?: SavedBattleV2): void {
    const stageId = bundle.stage.id;
    if (!isStageUnlocked(this.campaign, stageId)) return;
    const previousRenderedStageId = this.renderedStageId;
    try {
      this.activeStageId = stageId;
      this.activeBundle = bundle;
      this.persistStageSelection(stageId);
      this.showResolvedStageBundle(bundle);
      this.seed = seed;
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
      const initialHud = this.simulation.getHudProjection();
      this.commandSequence = Math.max(1_000_000, initialHud.lastCommandSeq);
      this.snapshotSequence = 0;
      this.lastSavedTick = saved?.tick ?? 0;
      this.currentOfferOrdinal = Math.max(1, initialHud.level);
      this.reviveOrdinal = initialHud.flowState === 'defeat-pending'
        ? initialHud.revivesUsed + 1
        : undefined;
      this.victory = initialHud.outcome === 'victory';
      this.endlessResult = undefined;
      this.endlessPreviousBest = undefined;
      this.endlessIsNewBest = undefined;
      this.endlessSettlementReason = undefined;
      if (
        initialHud.mode === 'endless' &&
        initialHud.flowState === 'result' &&
        initialHud.endless
      ) {
        this.restoreEndlessSettlement(bundle, initialHud, saved?.savedAt ?? Date.now());
      }
      this.pendingNextStageId = this.victory ? nextStageId(stageId) : undefined;
      this.fatalError = undefined;
      this.selectedTowerId = 0;
      this.aimingTowerId = undefined;
      this.activeTouchId = undefined;
      this.aimPoint = undefined;
      this.aimDragOrigin = undefined;
      this.aimDragActivated = false;
      this.towerDamageBuckets = [];
      this.strategyPanelOpen = false;
      this.strategyPanelResumeOnClose = false;
      this.loadingProgress = undefined;
      this.homeError = undefined;
      this.screen = 'battle';
      this.lastFrameAt = Date.now();
      this.refreshBattleProjection();
      this.audio.start();
      if (previousRenderedStageId !== stageId) {
        this.renderer.releaseStageAssets(previousRenderedStageId);
      }
    } catch (error) {
      this.store.clear(stageId);
      this.savedBattles.delete(stageId);
      this.screen = 'home';
      this.showStageBundle('STAGE_01');
      if (stageId !== 'STAGE_01') this.renderer.releaseStageAssets(stageId);
      if (previousRenderedStageId !== 'STAGE_01' && previousRenderedStageId !== stageId) {
        this.renderer.releaseStageAssets(previousRenderedStageId);
      }
      this.homeError = `战斗存档无法恢复：${this.errorMessage(error)}，已清理本关异常存档。`;
      this.fatalError = undefined;
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
        this.recordTowerDamage(output.events);
        const snapshot = this.simulation.getRenderSnapshot(1, ++this.snapshotSequence);
        this.renderer.pushEvents(output.events, snapshot);
        this.audio.playEvents(output.events);
        const endlessSettlement = output.events.find(
          (event): event is Extract<BattleEvent, { type: 'ENDLESS_SETTLED' }> =>
            event.type === 'ENDLESS_SETTLED',
        );
        if (endlessSettlement && !this.endlessResult) {
          this.handleEndlessSettlement(endlessSettlement);
        }
        if (
          this.activeBundle.mode !== 'endless' &&
          !this.victory &&
          output.events.some((event) => event.type === 'VICTORY')
        ) {
          const now = Date.now();
          this.campaign = completeCampaignStage(this.campaign, this.activeStageId, now);
          const next = nextStageId(this.activeStageId);
          if (next && isStageUnlocked(this.campaign, next)) {
            this.campaign = selectCampaignStage(this.campaign, next, now);
            this.selectedStageId = next;
            this.pendingNextStageId = next;
            void this.renderer.preloadStageAssets(next);
          } else {
            this.pendingNextStageId = undefined;
          }
          this.campaign = this.campaignStore.save(this.campaign);
          this.victory = true;
          this.store.clear(this.activeStageId);
          this.savedBattles.delete(this.activeStageId);
        }
        if (
          this.activeBundle.mode !== 'endless' &&
          output.events.some((event) => event.type === 'DEFEAT')
        ) {
          this.victory = false;
          this.pendingNextStageId = undefined;
          this.reviveOrdinal = undefined;
          this.store.clear(this.activeStageId);
          this.savedBattles.delete(this.activeStageId);
        }
      }
      for (const request of output.flowRequests) {
        if (request.type === 'OFFER') {
          this.currentOfferOrdinal = request.ordinal;
          pending.push(this.simulation.applyAuthorityEvent(
            this.authority.requestOffer(request.ordinal, undefined, request.eligibleEffectIds),
          ));
        } else if (!this.endlessResult) {
          this.reviveOrdinal = request.ordinal;
        }
      }
    }
  }

  private issueCommand(
    command: BattleCommandWithoutSequence,
  ): 'applied' | 'duplicate' | 'rejected' | undefined {
    if (!this.simulation) return undefined;
    this.commandSequence += 1;
    const output = this.simulation.applyCommand({
      ...command,
      seq: this.commandSequence,
    } as BattleCommand);
    this.processOutput(output);
    this.refreshBattleProjection();
    return output.commandAcks[0]?.status;
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
    if (this.authority.getRerollsRemaining(this.currentOfferOrdinal) <= 0) return;
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
    const anchor = this.activeBundle.route.towerAnchors[towerId];
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
    if (this.screen === 'loading') return;
    this.audio.start();
    if (id.startsWith('home-stage:')) {
      const stageId = id.slice('home-stage:'.length) as BattleStageId;
      if (STAGE_ORDER.includes(stageId)) void this.selectStage(stageId);
    } else if (id === 'home-start' || id === 'home-new') {
      this.startNewBattle(this.selectedStageId);
    } else if (id === 'overlay-retry') {
      this.startNewBattle(this.activeStageId);
    } else if (id === 'overlay-next' && this.pendingNextStageId) {
      this.startNewBattle(this.pendingNextStageId);
    } else if (id === 'home-continue') {
      this.continueBattle(this.selectedStageId);
    } else if (
      id === 'overlay-exit' &&
      this.hud?.mode === 'endless' &&
      this.hud.flowState === 'defeat-pending' &&
      !this.fatalError
    ) {
      this.issueCommand({ type: 'FORFEIT' });
    } else if (
      id === 'overlay-exit' &&
      this.hud?.mode === 'fixed' &&
      this.hud.flowState === 'defeat-pending' &&
      !this.fatalError
    ) {
      this.store.clear(this.activeStageId);
      this.savedBattles.delete(this.activeStageId);
      this.exitToHome(false);
    } else if (id === 'hud-back' || id === 'overlay-exit') {
      this.exitToHome();
    } else if (id === 'hud-speed' && this.hud) {
      this.issueCommand({ type: 'SET_SPEED', value: this.hud.speed === 1 ? 2 : 1 });
    } else if (id === 'hud-overdrive' && this.hud?.flowState === 'running') {
      this.issueCommand({ type: 'ACTIVATE_OVERDRIVE', towerId: this.selectedTowerId });
    } else if (id === 'hud-pause') {
      if (this.hud?.flowState === 'running') this.issueCommand({ type: 'PAUSE' });
      else if (this.hud?.flowState === 'paused') this.issueCommand({ type: 'RESUME' });
    } else if (id === 'hud-mute') {
      this.audio.setMuted(!this.audio.isMuted());
    } else if (id === 'hud-strategy') {
      this.openStrategyPanel();
    } else if (id === 'strategy-close') {
      this.closeStrategyPanel();
    } else if (id.startsWith('strategy-tower:')) {
      const towerId = Number(id.slice('strategy-tower:'.length));
      if (towerId === 0 || towerId === 1 || towerId === 2) this.selectedTowerId = towerId;
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

  private exitToHome(saveCurrentBattle = true): void {
    if (
      saveCurrentBattle &&
      this.simulation &&
      this.hud?.flowState !== 'result' &&
      !this.fatalError
    ) {
      this.saveBattle();
    }
    this.audio.suspend();
    this.screen = 'home';
    this.selectedTowerId = 0;
    this.aimingTowerId = undefined;
    this.activeTouchId = undefined;
    this.aimPoint = undefined;
    this.aimDragOrigin = undefined;
    this.aimDragActivated = false;
    this.towerDamageBuckets = [];
    this.strategyPanelOpen = false;
    this.strategyPanelResumeOnClose = false;
    this.refreshSavedBattles();
    void this.restoreCampaignSelection();
  }

  private saveBattle(): void {
    if (!this.simulation || !this.authority) return;
    try {
      const hud = this.simulation.getHudProjection();
      if (hud.flowState === 'result') return;
      const checkpointText = decodeText(this.simulation.createCheckpoint());
      const saved: SavedBattleV2 = {
        schemaVersion: 2,
        stageId: this.activeStageId,
        configHash: this.activeBundle.configHash,
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
      const baseBundle = STAGE_BUNDLES[stageId];
      const candidate = this.store.load(stageId, baseBundle.configHash);
      if (!candidate) continue;
      try {
        const bundle = resolveStageBundleForSeed(stageId, candidate.seed);
        const restored = createBattleSimulation(
          bundle,
          candidate.seed,
          encodeText(candidate.checkpointText),
        );
        const restoredHud = restored.getHudProjection();
        if (restoredHud.flowState === 'result') {
          if (restoredHud.mode === 'endless' && restoredHud.endless) {
            const recordIsDurable = this.persistRecoveredEndlessRecord(
              bundle,
              restoredHud.endless,
              candidate.savedAt,
            );
            if (!recordIsDurable) {
              this.savedBattles.set(stageId, candidate);
              continue;
            }
          }
          this.store.clear(stageId);
          continue;
        }
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

  private async selectStage(stageId: BattleStageId): Promise<void> {
    if (!isStageUnlocked(this.campaign, stageId)) return;
    if (stageId === this.selectedStageId && this.renderer.isStageAssetsLoaded(stageId)) {
      const previousRenderedStageId = this.renderedStageId;
      this.showStageBundle(stageId);
      if (previousRenderedStageId !== stageId) {
        this.renderer.releaseStageAssets(previousRenderedStageId);
      }
      this.homeError = undefined;
      this.loadingProgress = undefined;
      this.screen = 'home';
      return;
    }
    const generation = ++this.stageLoadGeneration;
    this.stageLoadTargetId = stageId;
    const previousRenderedStageId = this.renderedStageId;
    this.loadingMessage = `正在加载${STAGE_BUNDLES[stageId].stage.name}…`;
    this.loadingProgress = 0;
    this.homeError = undefined;
    this.screen = 'loading';
    try {
      await this.renderer.loadStageAssets(stageId, (progress) => {
        if (generation === this.stageLoadGeneration) this.loadingProgress = progress;
      });
      if (generation !== this.stageLoadGeneration || this.disposed) {
        this.releaseStaleStageLoad(stageId);
        return;
      }
      this.stageLoadTargetId = undefined;
      this.persistStageSelection(stageId);
      this.showStageBundle(stageId);
      if (previousRenderedStageId !== stageId) {
        this.renderer.releaseStageAssets(previousRenderedStageId);
      }
      this.loadingProgress = undefined;
      this.screen = 'home';
    } catch (error) {
      if (generation !== this.stageLoadGeneration || this.disposed) {
        this.releaseStaleStageLoad(stageId);
        return;
      }
      this.stageLoadTargetId = undefined;
      this.loadingProgress = undefined;
      this.renderer.releaseStageAssets(stageId);
      this.homeError = `关卡资源加载失败：${this.errorMessage(error)}`;
      this.screen = 'home';
    }
  }

  private async restoreCampaignSelection(): Promise<void> {
    const preferred = isStageUnlocked(this.campaign, this.campaign.selectedStageId)
      ? this.campaign.selectedStageId
      : 'STAGE_01';
    await this.selectStage(preferred);
  }

  private persistStageSelection(stageId: BattleStageId): void {
    this.campaign = selectCampaignStage(this.campaign, stageId, Date.now());
    this.campaign = this.campaignStore.save(this.campaign);
    this.selectedStageId = stageId;
    this.fatalError = undefined;
  }

  private showStageBundle(stageId: BattleStageId): void {
    this.showResolvedStageBundle(STAGE_BUNDLES[stageId]);
  }

  private showResolvedStageBundle(bundle: BattleBundleV1): void {
    this.renderer.setBundle(bundle);
    this.renderedStageId = bundle.stage.id;
  }

  private refreshEndlessRecords(): void {
    const bundle = STAGE_BUNDLES.STAGE_08;
    const recordsByRoute = new Map(this.endlessRecordStore.loadAll(
      bundle.releaseId,
      bundle.configHash,
    ).map((record) => [record.routeId, record]));
    this.endlessBestRecords = (bundle.endless?.routes ?? []).flatMap((route) => {
      const record = recordsByRoute.get(route.id);
      return record ? [record] : [];
    });
  }

  private createEndlessRecord(
    bundle: BattleBundleV1,
    score: EndlessScoreV1,
    achievedAt: number,
  ): EndlessRecordV1 {
    if (bundle.stage.id !== 'STAGE_08' || bundle.mode !== 'endless') {
      throw new Error('Only Stage 08 endless runs can create endless records.');
    }
    if (
      score.routeId !== bundle.route.id ||
      !bundle.endless?.routes.some((route) => route.id === score.routeId)
    ) {
      throw new Error('Endless score route does not match the resolved battle bundle.');
    }
    return {
      schemaVersion: 1,
      stageId: 'STAGE_08',
      routeId: score.routeId,
      releaseId: bundle.releaseId,
      configHash: bundle.configHash,
      reachedBoss: score.reachedBoss,
      bossDamageMilli: score.bossDamageMilli,
      bossLayer: score.bossLayer,
      scoreReachedTick: score.scoreReachedTick,
      survivalTick: score.survivalTick,
      achievedAt,
    };
  }

  private handleEndlessSettlement(
    event: Extract<BattleEvent, { type: 'ENDLESS_SETTLED' }>,
  ): void {
    if (this.endlessResult) return;
    const result = this.createEndlessRecord(this.activeBundle, event, Date.now());
    const previous = this.endlessRecordStore.load(
      result.routeId,
      result.releaseId,
      result.configHash,
    );
    this.endlessPreviousBest = previous;
    this.endlessIsNewBest = previous === undefined || compareEndlessRecords(result, previous) > 0;
    const persisted = this.endlessRecordStore.save(result);
    const recordIsDurable = persisted !== undefined && compareEndlessRecords(persisted, result) >= 0;
    this.endlessResult = result;
    this.endlessSettlementReason = event.reason;
    this.victory = false;
    this.pendingNextStageId = undefined;
    this.reviveOrdinal = undefined;
    if (recordIsDurable) {
      this.store.clear(this.activeStageId);
      this.savedBattles.delete(this.activeStageId);
    }
    this.refreshEndlessRecords();
  }

  private restoreEndlessSettlement(
    bundle: BattleBundleV1,
    hud: HudProjectionV1,
    achievedAt: number,
  ): void {
    if (!hud.endless) return;
    const result = this.createEndlessRecord(bundle, hud.endless, achievedAt);
    const previous = this.endlessRecordStore.load(
      result.routeId,
      result.releaseId,
      result.configHash,
    );
    this.endlessPreviousBest = previous;
    this.endlessIsNewBest = previous === undefined || compareEndlessRecords(result, previous) > 0;
    const persisted = this.endlessRecordStore.save(result);
    const recordIsDurable = persisted !== undefined && compareEndlessRecords(persisted, result) >= 0;
    this.endlessResult = result;
    this.endlessSettlementReason = hud.endless.settlementReason ?? undefined;
    this.victory = false;
    this.pendingNextStageId = undefined;
    this.reviveOrdinal = undefined;
    if (recordIsDurable) {
      this.store.clear(bundle.stage.id);
      this.savedBattles.delete(bundle.stage.id);
    }
    this.refreshEndlessRecords();
  }

  private persistRecoveredEndlessRecord(
    bundle: BattleBundleV1,
    score: EndlessScoreV1,
    achievedAt: number,
  ): boolean {
    const result = this.createEndlessRecord(bundle, score, achievedAt);
    const persisted = this.endlessRecordStore.save(result);
    this.refreshEndlessRecords();
    return persisted !== undefined && compareEndlessRecords(persisted, result) >= 0;
  }

  private releaseStaleStageLoad(stageId: BattleStageId): void {
    if (this.stageLoadTargetId === stageId || this.renderedStageId === stageId) return;
    this.renderer.releaseStageAssets(stageId);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private makeSeed(): number {
    const globals = globalThis as typeof globalThis & { crypto?: Crypto };
    if (globals.crypto?.getRandomValues) {
      return globals.crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffff_ffff)) >>> 0 || 1;
  }

  private recordTowerDamage(events: BattleEvent[]): void {
    for (const event of events) {
      if (event.type !== 'HIT') continue;
      let bucket: TowerDamageBucket | undefined =
        this.towerDamageBuckets[this.towerDamageBuckets.length - 1];
      if (!bucket || bucket.tick !== event.tick) {
        bucket = this.towerDamageBuckets.find((candidate) => candidate.tick === event.tick);
      }
      if (!bucket) {
        bucket = { tick: event.tick, damageByTowerMilli: [0, 0, 0] };
        this.towerDamageBuckets.push(bucket);
      }
      bucket.damageByTowerMilli[event.towerId] += event.damageMilli;
    }
    this.pruneTowerDamageBuckets();
  }

  private pruneTowerDamageBuckets(): void {
    const currentTick = this.hud?.tick ?? this.simulation?.getHudProjection().tick ?? 0;
    const earliestTick = currentTick - DAMAGE_METRIC_WINDOW_TICKS + 1;
    const firstVisible = this.towerDamageBuckets.findIndex((bucket) => bucket.tick >= earliestTick);
    if (firstVisible < 0) {
      this.towerDamageBuckets = [];
    } else if (firstVisible > 0) {
      this.towerDamageBuckets.splice(0, firstVisible);
    }
  }

  private getTowerMetrics(): TowerMetricRenderState[] {
    this.pruneTowerDamageBuckets();
    const currentTick = this.hud?.tick ?? this.simulation?.getHudProjection().tick ?? 0;
    const oneSecondStart = currentTick - TICKS_PER_SECOND + 1;
    return ([0, 1, 2] as const).map((towerId) => ({
      towerId,
      damageLast1sMilli: this.towerDamageBuckets.reduce(
        (sum, bucket) => sum + (bucket.tick >= oneSecondStart ? bucket.damageByTowerMilli[towerId] : 0),
        0,
      ),
      damageLast3sMilli: this.towerDamageBuckets.reduce(
        (sum, bucket) => sum + bucket.damageByTowerMilli[towerId],
        0,
      ),
    }));
  }

  private openStrategyPanel(): void {
    if (!this.hud || this.strategyPanelOpen) return;
    if (
      this.hud.flowState !== 'running' &&
      this.hud.flowState !== 'paused' &&
      this.hud.flowState !== 'performance-paused'
    ) {
      return;
    }
    this.strategyPanelOpen = true;
    this.strategyPanelResumeOnClose = this.hud.flowState === 'running';
    if (this.strategyPanelResumeOnClose) this.issueCommand({ type: 'PAUSE' });
  }

  private closeStrategyPanel(): void {
    if (!this.strategyPanelOpen) return;
    const shouldResume = this.strategyPanelResumeOnClose;
    this.strategyPanelOpen = false;
    this.strategyPanelResumeOnClose = false;
    if (shouldResume && this.hud?.flowState === 'paused') {
      this.issueCommand({ type: 'RESUME' });
    }
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
