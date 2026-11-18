import { webview } from '@kit.ArkWeb';
import { promptAction } from '@kit.ArkUI';
import { DocumentViewPicker } from '@kit.CoreFileKit';
import { ConfigStore, DEFAULT_URL, MOBILE_UA, DESKTOP_UA } from '../utils/ConfigStore';

@CustomDialog
struct SettingsDialog {
  controller: CustomDialogController;
  currentUrl: string = '';
  onConfirm: (url: string) => void = () => {};

  build() {
    Column() {
      Text('连接闲亭服务器')
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
        .margin({ top: 16 })
      Text('请输入闲亭服务器地址（默认端口 8787）\n例如：http://192.168.1.100:8787\n请在电脑上启动闲亭服务端，并确保手机与其在同一局域网')
        .fontSize(13)
        .fontColor('#666666')
        .margin({ top: 8, bottom: 8 })
      TextInput({ placeholder: DEFAULT_URL, text: this.currentUrl })
        .height(44)
        .fontSize(15)
        .onChange((v: string) => {
          this.currentUrl = v;
        })
      Row({ space: 12 }) {
        Button('取消')
          .layoutWeight(1)
          .onClick(() => this.controller.close())
        Button('保存并连接')
          .layoutWeight(1)
          .backgroundColor('#2563EB')
          .onClick(() => {
            this.onConfirm(this.currentUrl.trim());
            this.controller.close();
          })
      }
      .margin({ top: 16 })
    }
    .padding({ left: 20, right: 20, bottom: 20 })
  }
}

@Entry
@Component
struct Index {
  @State baseUrl: string = DEFAULT_URL;
  @State configured: boolean = false;
  @State desktopUa: boolean = false;
  @State errorMsg: string = '';
  @State loading: boolean = true;
  private controller: webview.WebviewController = new webview.WebviewController();
  private dialogController: CustomDialogController | null = null;

  async aboutToAppear(): Promise<void> {
    const store = await ConfigStore.get();
    const url = await store.getUrl();
    if (url && url.length > 0) {
      this.baseUrl = url;
      this.configured = true;
    } else {
      setTimeout(() => this.openSettings(), 300);
    }
    this.desktopUa = await store.getDesktopUa();
  }

  openSettings(): void {
    if (this.dialogController) {
      this.dialogController.open();
      return;
    }
    this.dialogController = new CustomDialogController({
      builder: SettingsDialog({
        currentUrl: this.baseUrl,
        onConfirm: (url: string) => this.onUrlConfirmed(url)
      }),
      autoCancel: true,
      customStyle: true
    });
    this.dialogController.open();
  }

  onUrlConfirmed(url: string): void {
    if (!url) {
      promptAction.showToast({ message: '地址不能为空' });
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) url = 'http://' + url;
    url = url.replace(/\/+$/, '');
    this.baseUrl = url;
    this.configured = true;
    this.errorMsg = '';
    ConfigStore.get().then((s) => s.setUrl(url));
    promptAction.showToast({ message: '已保存: ' + url });
  }

  onWebError(event: webview.ErrorEvent): void {
    this.loading = false;
    this.errorMsg = '无法连接到闲亭服务器：\n' + this.baseUrl +
      (event && event.errorMessage ? '\n\n' + event.errorMessage : '');
  }

  onFileSelector(event: webview.FileSelectorEvent): void {
    const picker = new DocumentViewPicker();
    picker.select({ maxSelectNumber: 5 })
      .then((result: string[]) => {
        event.callback(result && result.length > 0 ? result : []);
      })
      .catch(() => event.callback([]));
  }

  reload(): void {
    if (!this.configured) {
      this.openSettings();
      return;
    }
    this.errorMsg = '';
    this.controller.refresh();
  }

  toggleUa(): void {
    this.desktopUa = !this.desktopUa;
    ConfigStore.get().then((s) => s.setDesktopUa(this.desktopUa));
    promptAction.showToast({ message: this.desktopUa ? '已切换桌面模式' : '已切换移动模式' });
    if (this.configured) this.controller.refresh();
  }

  build() {
    Column() {
      // 顶部工具栏
      Row({ space: 6 }) {
        Text('闲亭 · 家庭棋牌')
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.errorMsg.length > 0 ? '#FFFFFF' : '#FFFFFF')
          .layoutWeight(1)
        Button(this.desktopUa ? '移动模式' : '桌面模式')
          .fontSize(12)
          .type(ButtonType.Normal)
          .onClick(() => this.toggleUa())
        Button('刷新')
          .fontSize(12)
          .onClick(() => this.reload())
        Button('设置')
          .fontSize(12)
          .backgroundColor('#FFFFFF')
          .fontColor('#2563EB')
          .onClick(() => this.openSettings())
      }
      .width('100%')
      .padding({ left: 12, right: 12, top: 10, bottom: 10 })
      .backgroundColor('#2563EB')

      // 主区域
      Stack({ alignContent: Alignment.TopCenter }) {
        if (this.configured) {
          Web({ src: this.baseUrl, controller: this.controller })
            .javaScriptAccess(true)
            .domStorageAccess(true)
            .imageAccess(true)
            .onlineImageAccess(true)
            .cacheMode(webview.CacheMode.Default)
            .userAgent(this.desktopUa ? DESKTOP_UA : MOBILE_UA)
            .overScrollMode(OverScrollMode.NEVER)
            .onPageBegin(() => {
              this.loading = true;
            })
            .onPageEnd(() => {
              this.loading = false;
              this.errorMsg = '';
            })
            .onError((e: webview.ErrorEvent) => this.onWebError(e))
            .onShowFileSelector((e: webview.FileSelectorEvent) => this.onFileSelector(e))
            .width('100%')
            .layoutWeight(1)
        }

        if (this.loading && this.configured) {
          LoadingProgress()
            .width(56)
            .height(56)
            .color('#2563EB')
            .margin({ top: 16 })
        }

        if (this.errorMsg.length > 0) {
          Column({ space: 12 }) {
            Text('📡').fontSize(44)
            Text(this.errorMsg)
              .fontSize(14)
              .fontColor('#666666')
              .textAlign(TextAlign.Center)
              .lineHeight(22)
            Row({ space: 12 }) {
              Button('重试').onClick(() => this.reload())
              Button('修改地址')
                .backgroundColor('#2563EB')
                .onClick(() => this.openSettings())
            }
          }
          .padding(24)
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
        }
      }
      .width('100%')
      .layoutWeight(1)
    }
    .width('100%')
    .height('100%')
  }
}
