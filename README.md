# BLE 蓝牙调试助手（网页版）

一个可直接部署到 **GitHub Pages / Gitee Pages** 的手机端 BLE（低功耗蓝牙）调试工具。纯前端、无后端，基于浏览器原生 **Web Bluetooth API**。

## 在线地址

> **在手机（Android + Chrome/Edge）上直接打开下方地址即可使用。**

- ✅ GitHub Pages：<https://fanzhegnshiwo.github.io/ble-debug-tool/>
- 🆕 Gitee Pages（国内访问更快，推荐）：<https://fanhengshiwo.gitee.io/ble-debug-tool/>

## 功能

- **设备扫描与连接**：扫描附近 BLE 设备，支持按服务 UUID 过滤
- **UART 串口透传**：配置 TX / RX 特征值 UUID，双向发收文本 / HEX 数据
- **GATT 服务/特征值浏览**：读取设备所有服务，支持 Read / Write / WriteWithoutResponse
- **通知监听**：订阅 notify / indicate，实时显示特征值变化
- **HEX + 文本双显示**：收发数据可自由切换十六进制 / 文本显示

## 兼容性（重要）

Web Bluetooth API 目前**只支持 Android 和桌面浏览器**：

| 平台 | 浏览器 | 支持 |
|------|--------|:----:|
| Android | Chrome / Edge / 微信内置浏览器(Chromium) | ✅ |
| Android | 部分国内应用内置浏览器 | ⚠️ 需 Chromium 内核且授权蓝牙 |
| iOS / iPhone | Safari | ❌ 不支持 |
| 桌面 | Chrome / Edge | ✅（可测试界面，但无实际 BLE 外设时仅能看界面） |

> 必须在发出蓝牙请求的页面上**点击一次**按钮（用户手势），否则会被拦截。
> 需要通过 HTTPS 或 `localhost` 访问（GitHub / Gitee Pages 均满足）。

## 本地运行

任选其一：

```bash
# 方式一：Python
python -m http.server 8080

# 方式二：Node
npx serve .
```

浏览器访问 `http://localhost:8080`。（本地 localhost 可免 HTTPS 使用蓝牙。）

## 部署到 GitHub Pages / Gitee Pages

1. 把本项目推送到你的仓库（见下文）。
2. 仓库 **Settings → Pages**，Source 选择 `main` 分支根目录 `/`，保存。
3. 等待几分钟，即可通过 `https://你的用户名.github.io/仓库名/` 访问。

**在手机上访问**：直接用 Android Chrome 打开上述网址即可使用。

## 使用说明

1. 打开页面，点击 **搜索设备** → 在系统选择框中选择设备 → 点击 **连接**（可先填服务 UUID / 名称关键字过滤）。
2. 连接成功后进入 **透传** 页：填好 TX（写入）和 RX（读取/接收）特征值 UUID，点 **保存配置** 会自动订阅 RX。
3. 在发送框输入文本或 HEX（如 `01 02 A0 FF`），选择 **文本 / HEX** 模式后发送。
4. **特征值** 页可浏览所有 GATT 服务、读取与写入；**监听** 页查看所有订阅通知。

## 项目结构

```
├── index.html          # 页面结构
├── css/style.css       # 样式（深色移动端主题）
├── js/app.js           # 核心逻辑（Web Bluetooth）
└── README.md
```