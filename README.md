# 外卖账号管理系统

![构建状态](https://github.com/yourusername/waimai/workflows/构建应用/badge.svg)
![版本](https://img.shields.io/github/v/release/yourusername/waimai)
![许可证](https://img.shields.io/github/license/yourusername/waimai)

多平台外卖账号管理工具，支持美团外卖、饿了么、京东到家等平台账号的统一管理和自动会话维护。

## 功能特点

- **多平台账号管理**：统一管理多个外卖平台的商家账号
- **账号安全存储**：使用AES-256加密算法本地安全存储账号信息
- **独立浏览器窗口**：每个账号使用独立的浏览器窗口登录
- **自动会话维护**：定期自动刷新会话状态，保持账号长期在线
- **状态监控**：实时监控账号登录状态和会话有效性

## 安装方法

### Windows用户

1. 从[最新发布版本](https://github.com/yourusername/waimai/releases/latest)下载`外卖账号管理系统-1.0.0-x64.exe`安装包
2. 双击安装包，按照向导完成安装
3. 从开始菜单或桌面快捷方式启动应用

### macOS用户

1. 从[最新发布版本](https://github.com/yourusername/waimai/releases/latest)下载`外卖账号管理系统-1.0.0-arm64.dmg`(Apple Silicon)或`外卖账号管理系统-1.0.0.dmg`(Intel)
2. 打开DMG文件并将应用拖到Applications文件夹
3. 从启动台或Applications文件夹启动应用

### 便携版

1. 从[最新发布版本](https://github.com/yourusername/waimai/releases/latest)下载`外卖账号管理系统-1.0.0.zip`
2. 解压到任意位置
3. 安装Electron: `npm install -g electron`
4. 运行start.bat(Windows)或start.sh(macOS/Linux)

## 开发指南

### 环境要求

- Node.js 14+
- npm 或 yarn

### 安装依赖

```bash
# 使用npm
npm install

# 或使用yarn
yarn
```

### 本地运行

```bash
npm start
# 或
yarn start
```

### 构建应用

```bash
# 使用npm
npm run build

# 或使用yarn
yarn build

# 构建特定平台
npm run build:win  # Windows
npm run build:mac  # macOS
npm run build:linux  # Linux
```

## 自动构建

本项目使用GitHub Actions自动构建Windows和macOS版本。每次推送到main分支或创建新标签时，都会触发自动构建流程。

### 手动触发构建

1. 在GitHub仓库页面，点击"Actions"选项卡
2. 选择"构建应用"工作流
3. 点击"Run workflow"按钮
4. 可以选择指定版本号，然后点击"Run workflow"

### 发布新版本

1. 创建新的版本标签：`git tag v1.0.1`
2. 推送标签到GitHub：`git push origin v1.0.1`
3. GitHub Actions将自动构建并创建新的发布版本

## 许可证

MIT

## 联系方式

项目维护者 - [@yourusername](https://github.com/yourusername)

项目链接: [https://github.com/yourusername/waimai](https://github.com/yourusername/waimai) 