import { GAME_TITLE } from './brand';
import { GuardianGateGame } from './GuardianGateGame';
import { installEncodingPolyfills } from './platform/wechat';

installEncodingPolyfills();

wx.onShareAppMessage?.(() => ({ title: GAME_TITLE }));
wx.showShareMenu?.({ menus: ['shareAppMessage'] });

new GuardianGateGame();
