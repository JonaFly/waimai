# 外卖账号管理系统

![版本](https://img.shields.io/badge/版本-1.0.0-blue)
![许可](https://img.shields.io/badge/许可-MIT-green)

外卖账号管理系统是一个基于Electron的桌面应用，专为需要管理多个外卖平台账号的商户设计。系统支持多平台账号管理、状态监控和自动化操作，帮助商户提高运营效率。

## 核心功能

- **多平台支持**: 美团外卖、饿了么、京东外卖等主流外卖平台
- **账号管理**: 添加、编辑、删除和查看账号信息
- **状态监控**: 实时监控账号登录状态和有效期
- **自动化操作**: (即将推出) 商品管理、价格调整、订单处理等自动化功能

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/waimai.git

# 进入项目目录
cd waimai

# 安装依赖
npm install

# 启动应用
npm start
```

### 使用方法

1. 点击"添加账号"按钮添加平台账号
2. 输入账号信息并保存
3. 点击"登录"按钮登录到相应平台
4. 使用"刷新"按钮更新账号状态

## 开发指南

### 技术栈

- **框架**: Electron
- **前端**: HTML, CSS, JavaScript
- **数据存储**: 本地加密存储
- **网页自动化**: Electron内置浏览器功能

### 项目结构

```
waimai/
├── src/                # 源代码
│   ├── main/           # 主进程代码
│   └── renderer/       # 渲染进程代码
├── public/             # 静态资源
│   ├── css/            # 样式文件
│   ├── js/             # 渲染进程JavaScript
│   └── index.html      # 主页面
├── scripts/            # 脚本工具
├── releases/           # 版本发布说明
└── RPA-ROADMAP.md      # RPA功能开发路线图
```

### 版本控制

项目使用语义化版本控制：`主版本.次版本.修订版本`

- **主版本**: 不兼容的API修改
- **次版本**: 向后兼容的功能新增
- **修订版本**: 向后兼容的问题修复

查看[版本发布说明](./releases)了解各版本详情。

## 路线图

项目计划分阶段实现以下功能：

- [x] **v1.0.0**: 基础账号管理功能
- [ ] **v1.1.0**: 会话管理增强
- [ ] **v2.0.0**: RPA基础框架
- [ ] **v2.1.0**: 商品管理自动化
- [ ] **v3.0.0**: 高级自动化功能

详细的开发计划请查看[RPA功能开发路线图](./RPA-ROADMAP.md)。

## 贡献指南

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 打开Pull Request

## 许可证

本项目采用MIT许可证 - 详见[LICENSE](./LICENSE)文件

## 联系方式

项目维护者 - [@yourusername](https://github.com/yourusername)

项目链接: [https://github.com/yourusername/waimai](https://github.com/yourusername/waimai) 