# 外卖账号管理系统

一个用于管理多个外卖平台商家账号的桌面应用程序，支持自动登录、会话维护和状态监控。

## 功能特性

- **多平台账号管理**：支持美团、京东等多个外卖平台的商家账号
- **自动登录**：通过脚本自动完成账号登录流程
- **会话维护**：智能刷新会话，避免频繁登录
- **状态监控**：实时监控账号登录状态
- **多平台支持**：支持 Windows、macOS 系统

## 安装说明

### 下载预构建版本

从 [GitHub Releases](https://github.com/yourusername/waimai/releases) 页面下载最新版本：

- Windows 用户：下载 `WaimaiAccountManager-portable-win-x64.zip` 并解压
- macOS 用户：下载 `WaimaiAccountManager-portable-mac-x64.zip` 并解压

### 从源码构建

1. 克隆仓库
```bash
git clone https://github.com/yourusername/waimai.git
cd waimai
```

2. 安装依赖
```bash
npm install
```

3. 启动应用
```bash
npm start
```

4. 构建应用
```bash
# 构建所有平台
npm run build

# 仅构建 Windows 版本
npm run build:win

# 仅构建 macOS 版本
npm run build:mac
```

## 使用说明

### 添加账号

1. 点击"添加账号"按钮
2. 选择平台类型（美团、京东等）
3. 输入账号名称和备注信息
4. 点击"保存"

### 登录账号

1. 在账号列表中选择要登录的账号
2. 点击"登录"按钮
3. 系统将自动打开浏览器并执行登录脚本
4. 如遇验证码，请手动完成验证

### 会话维护

应用会自动维护账号会话，通过以下方式：

- 定期静默访问账号页面，保持会话活跃
- 智能检测会话状态，仅在必要时刷新
- 避免频繁登录导致的验证码问题

## 系统要求

- Windows 10/11 64位 或 macOS 10.15+
- 至少 4GB RAM
- 至少 200MB 可用磁盘空间

## 常见问题

### 登录失败怎么办？

- 检查账号密码是否正确
- 确认网络连接正常
- 如遇验证码，请手动完成验证

### 如何更新应用？

下载最新版本并替换旧版本即可，账号数据会自动保留。

## 许可证

MIT

## 联系方式

项目维护者 - [@yourusername](https://github.com/yourusername)

项目链接: [https://github.com/yourusername/waimai](https://github.com/yourusername/waimai) 