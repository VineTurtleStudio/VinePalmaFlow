<div align="center">

# 🌿 VinePalmaFlow

**纯本地的项目管理与协作工具 — 不上云，但在局域网里像云一样协作**

<a href="#-简体中文">简体中文</a> ·
<a href="#-繁體中文">繁體中文</a> ·
<a href="#-english">English</a> ·
<a href="#-日本語">日本語</a>

</div>

---

## 🇨🇳 简体中文

**零账号、零上传**：项目数据是你能直接打开、能用 Git 管的 **Markdown / YAML 文件**，全部留在自己的设备上。同一局域网内的设备加密配对后可以增量同步。

### 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20（建议 20 / 22 LTS） | 前端构建 |
| Rust | ≥ 1.77 | Tauri 2 后端 |
| 系统 | Windows 10/11 · macOS 13+ · Ubuntu 22+ | 跨平台 |

Linux 另需系统依赖：

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### 快速开始

```bash
npm install
npm run tauri dev     # 开发模式
npm run tauri build   # 打包
```

只调界面：`npm run dev`

### 五分钟上手

1. 新建项目 → 填名称、负责人、起止时间（表单模式，够用就行）
2. 需要更细的控制时，切到 YAML 模式直接改字段
3. 任务卡片拖动排序，状态在建 / 完成 / 阻塞之间切换
4. 右上角「导出」可导出 Excel / CSV / JSON
5. 两台设备在同一局域网 → 配对 → 开始增量同步

### 数据存在哪里

```
<项目目录>/
  project.yaml      项目元数据
  tasks.md          任务清单（Markdown 表格）
  notes/            会议记录、备注
```

格式是人类可读的纯文本，可以直接进 Git 做版本管理。

### 功能

- **双模式编辑**：表单模式给新手，YAML + Markdown 模式给进阶用户，二者实时同步
- **本地优先**：断网可用，所有数据在本地磁盘
- **局域网同步**：加密配对后增量同步，不经过任何服务器
- **导出**：Excel / CSV / JSON
- **示例项目**：`samples/` 下有可直接打开的例子

### 目录结构

```
src/           前端（React + TS）
  components/  界面组件
  stores/      状态管理
src-tauri/     Rust 后端（文件读写、同步、导出）
docs/          设计与使用文档
samples/       示例项目
```

### 常见问题

- **同步连不上**：确认两台设备在同一网段，防火墙放行应用
- **YAML 改坏了**：切回表单模式会提示语法错误的位置；也可从 Git 恢复
- **数据迁移**：整个项目目录拷走即可，没有数据库

## 🇹🇼 繁體中文

**零帳號、零上傳**：專案資料是你可以直接開啟、能用 Git 管理的 **Markdown / YAML 檔案**，全部留在自己的裝置上。同一區域網路內的裝置加密配對後可增量同步。

### 環境需求

| 依賴 | 版本 | 說明 |
|---|---|---|
| Node.js | ≥ 20（建議 20 / 22 LTS） | 前端建置 |
| Rust | ≥ 1.77 | Tauri 2 後端 |
| 系統 | Windows 10/11 · macOS 13+ · Ubuntu 22+ | 跨平台 |

### 快速開始

```bash
npm install
npm run tauri dev
npm run tauri build
```

### 五分鐘上手

1. 新增專案 → 填名稱、負責人、起訖時間（表單模式）
2. 需要更細的控制時切到 YAML 模式直接改欄位
3. 任務卡片拖曳排序，狀態在進行 / 完成 / 阻塞間切換
4. 右上角「匯出」可輸出 Excel / CSV / JSON
5. 兩台裝置在同一網段 → 配對 → 開始增量同步

### 資料位置

```
<專案目錄>/
  project.yaml      專案中繼資料
  tasks.md          任務清單（Markdown 表格）
  notes/            會議記錄、備註
```

純文字格式，可直接納入 Git 版控。

### 功能

- **雙模式編輯**：表單給新手，YAML + Markdown 給進階使用者，雙向同步
- **本地優先**：離線可用
- **區域網路同步**：加密配對、增量同步，不經伺服器
- **匯出**：Excel / CSV / JSON

## 🇬🇧 English

**No account, no uploads**: your project data is **Markdown / YAML you can open in any editor and version with Git**, stored entirely on your own devices. Devices on the same LAN can pair and sync incrementally.

### Requirements

| Dependency | Version |
|---|---|
| Node.js | ≥ 20 (20 / 22 LTS recommended) |
| Rust | ≥ 1.77 |
| OS | Windows 10/11 · macOS 13+ · Ubuntu 22+ |

Linux also needs:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Quick start

```bash
npm install
npm run tauri dev
npm run tauri build
```

### Five-minute tour

1. Create a project — name, owner, start/end dates (form mode)
2. Switch to YAML mode when you need finer control
3. Drag task cards to reorder; move them between in-progress / done / blocked
4. **Export** to Excel / CSV / JSON from the top-right menu
5. Two devices on the same LAN → pair → incremental sync

### Where the data lives

```
<project dir>/
  project.yaml      project metadata
  tasks.md          task list (Markdown table)
  notes/            meeting notes, remarks
```

Plain text, human-readable, Git-friendly.

### Features

- **Two editing modes** — forms for newcomers, YAML + Markdown for power users, kept in sync
- **Local-first** — works offline; nothing leaves the disk
- **LAN sync** — encrypted pairing, incremental transfer, no server involved
- **Export** — Excel / CSV / JSON
- **Sample project** — see `samples/`

### Troubleshooting

- **Sync cannot connect** — same subnet? check the firewall rule for the app
- **Broken YAML** — switch back to form mode for the error location, or restore from Git
- **Moving data** — copy the whole project folder; there is no database

## 🇯🇵 日本語

**アカウント不要・アップロードなし**。プロジェクトのデータは**エディタで開ける Markdown / YAML** で、Git 管理もできます。同一 LAN 上の端末は暗号化ペアリング後に差分同期できます。

### 必要なもの

| 依存 | バージョン |
|---|---|
| Node.js | ≥ 20（20 / 22 LTS 推奨） |
| Rust | ≥ 1.77 |
| OS | Windows 10/11 · macOS 13+ · Ubuntu 22+ |

Linux は追加パッケージが必要です。

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### クイックスタート

```bash
npm install
npm run tauri dev
npm run tauri build
```

### 5 分ツアー

1. プロジェクト作成（名前・担当・期間。フォームモードで十分）
2. 細かく制御したいときは YAML モードへ切り替え
3. タスクカードをドラッグして並べ替え、進行中 / 完了 / ブロックを切替
4. 右上の「エクスポート」で Excel / CSV / JSON
5. 同じ LAN の 2 台をペアリング → 差分同期

### データの場所

```
<プロジェクト>/
  project.yaml      メタデータ
  tasks.md          タスク一覧（Markdown 表）
  notes/            議事録・メモ
```

プレーンテキストなので Git 管理に向きます。

### 機能

- **2 つの編集モード** — フォームと YAML + Markdown、双方向同期
- **ローカルファースト** — オフラインで動作
- **LAN 同期** — 暗号化ペアリング、差分転送、サーバー不要
- **エクスポート** — Excel / CSV / JSON
