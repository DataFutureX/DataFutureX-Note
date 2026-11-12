# DataFutureX-Note（数字未来笔记）

本地优先的 Windows 桌面 Markdown 笔记软件。笔记以开放的 `.md` 文件保存在你指定的本机目录，不绑定云账号，数据始终可控。

| 项 | 说明 |
|---|---|
| 产品名 | DataFutureX Note / 数字未来笔记 |
| 版本 | 1.0.0 |
| 平台 | Windows 10/11 x64 |
| 技术栈 | Electron · Vue 3 · TypeScript · Pinia · Vditor · CodeMirror |
| 许可证 | MIT |

## 功能概览

- **本地笔记库**：自行选择根目录；支持推荐库与环境自检
- **三栏布局**：目录树 / 章节大纲 / 内容区，可拖拽调宽、折叠或极简写作
- **类 Typora 编辑**：默认即时渲染；亦可源码、分屏、预览
- **笔记管理**：新建 / 重命名 / 删除 / 拖动移动 / 复制；回收站可恢复
- **自动保存**：默认约 1 秒自动保存，支持 Ctrl+S
- **全局搜索**：目录区搜索图标展开后可搜标题与正文（Ctrl+F）
- **备份与导入**：整库或当前文件夹 ZIP 备份；ZIP 导入
- **导出**：Markdown / Word (DOCX) / PDF
- **主题**：浅色 / 深色 / 跟随系统；主题色暖黄、柔蓝（默认）、纸感、柔绿、灰白，明暗各有对应变体
- **系统托盘**：关闭窗口可驻留托盘（托盘可用时）

## 快速开始（用户）

1. 安装 `release/` 中的 `DataFutureX-Note-*-Setup.exe`（或构建产物）
2. 首次启动选择笔记库根目录（已有目录或空目录均可，不会清空内容）
3. 在目录中新建文件夹与笔记，开始书写

更完整的使用说明见 [用户手册](docs/用户手册.md)。

## 开发

### 环境要求

- Node.js 20+
- Windows 10/11 x64

### 安装与运行

```bash
npm install
npm run dev
```

若 Electron 二进制下载失败，可设置镜像后再安装：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

### 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式启动 |
| `npm run typecheck` | TypeScript / Vue 类型检查 |
| `npm test` | 运行 Vitest 单测 |
| `npm run selfcheck` | 文件系统与路径相关自检用例 |
| `npm run build` | 类型检查 + 构建 + 打 Windows 安装包 |
| `npm run build:dir` | 构建未打包的目录版（便于调试） |
| `npm run pack` | 仅对已构建产物执行 electron-builder |

安装包与产物输出到 `release/`。构建细节见 [构建说明](docs/构建说明.md)。

## 目录结构（简要）

```
DataFutureX-Note/
├── src/                 # 渲染进程（Vue）
│   ├── components/      # UI 组件
│   ├── stores/          # Pinia（settings / library）
│   ├── styles/          # 全局样式与主题色
│   └── views/           # 欢迎页 / 主界面 / 设置
├── electron/
│   ├── main/            # 主进程、IPC、笔记/备份等服务
│   └── preload/         # 预加载桥接 noteAPI
├── docs/                # 架构、手册、IPC、构建与测试文档
├── resources/           # 图标与托盘资源
├── tests/               # Vitest 测试
└── scripts/             # 开发、图标、Electron 运行时等脚本
```

## 文档

- [用户手册](docs/用户手册.md)
- [架构说明](docs/架构说明.md)
- [IPC 接口](docs/IPC接口.md)
- [构建说明](docs/构建说明.md)
- [测试报告](docs/测试报告.md)
- [开发任务书](docs/DataFutureX-Note_数字未来笔记_开发任务书.md)

## 品牌与版权

- 品牌：DataFutureX
- Copyright © 2026 DataFutureX
- 开源协议：[MIT License](LICENSE)
