import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(0x0000, 'fnos', 'EntryAbility onCreate');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(0x0000, 'fnos', 'onWindowStageCreate');
    windowStage.loadContent('pages/Index', (err) => {
      if (err) {
        hilog.error(0x0000, 'fnos', 'loadContent failed: %{public}s', JSON.stringify(err) ?? '');
        return;
      }
      hilog.info(0x0000, 'fnos', 'loadContent success');
    });
  }

  onDestroy(): void {
    hilog.info(0x0000, 'fnos', 'onDestroy');
  }
}
