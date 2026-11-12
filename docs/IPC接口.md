# IPC 接口说明

Preload 通过 `window.noteAPI` 暴露白名单接口，渲染进程不得直接访问 Node.js。

## 根目录与库

| 方法 | 说明 |
|---|---|
| `selectRootDirectory()` | 系统目录对话框选择并保存根目录 |
| `getRootDirectory()` | 读取当前根目录 |
| `setRootDirectory(dir)` | 校验后设置根目录 |
| `getFolderTree()` / `refreshLibrary()` | 扫描文件夹树 |
| `watchLibrary(cb)` | 监听库变更 |

## 文件夹 / 笔记

| 方法 | 说明 |
|---|---|
| `createFolder/renameFolder/moveFolder/deleteFolder` | 文件夹 CRUD / 移动 |
| `listNotes/createNote/readNote/saveNote` | 笔记读写 |
| `renameNote/deleteNote/moveNote/copyNote` | 笔记管理 |
| `searchNotes(keyword)` | 全局搜索 |

## 备份导入导出

| 方法 | 说明 |
|---|---|
| `backupLibrary/backupFolder` | ZIP 备份 |
| `inspectBackup/importBackup` | 校验与导入 |
| `exportMarkdown/exportWord/exportPdf` | 导出 |

## 设置与主题

| 方法 | 说明 |
|---|---|
| `getSettings/updateSettings` | 配置持久化 |
| `getSystemTheme/onSystemThemeChanged` | 系统主题 |
| `saveRecoveryDraft/loadRecoveryDraft/...` | 异常恢复草稿 |

所有路径参数均在主进程做根目录边界校验；错误以 `{ code, message }` 形式返回。
