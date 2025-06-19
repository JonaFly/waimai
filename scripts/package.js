#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取项目根目录
const projectRoot = path.join(__dirname, '..');

// 获取package.json内容
const packageJson = require(path.join(projectRoot, 'package.json'));
const appVersion = packageJson.version;
const appName = packageJson.build.productName;

console.log(`开始打包 ${appName} v${appVersion}`);

// 创建输出目录
const outputDir = path.join(projectRoot, 'dist', 'simple-package');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 复制必要的文件
console.log('复制应用文件...');
const filesToCopy = [
  'src/**/*',
  'public/**/*',
  'package.json',
  'version.json',
  'LICENSE'
];

try {
  // 清理输出目录
  execSync(`rm -rf ${outputDir}/*`, { stdio: 'inherit' });
  
  // 创建应用目录结构
  fs.mkdirSync(path.join(outputDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'public'), { recursive: true });
  
  // 复制文件
  filesToCopy.forEach(pattern => {
    const basePath = pattern.split('/')[0];
    if (basePath.includes('*')) return;
    
    if (fs.existsSync(path.join(projectRoot, basePath))) {
      if (fs.lstatSync(path.join(projectRoot, basePath)).isDirectory()) {
        execSync(`cp -R ${path.join(projectRoot, basePath)}/* ${path.join(outputDir, basePath)}/`, { stdio: 'inherit' });
      } else {
        execSync(`cp ${path.join(projectRoot, basePath)} ${path.join(outputDir, basePath)}`, { stdio: 'inherit' });
      }
    }
  });
  
  // 创建启动脚本
  const startScript = `#!/bin/bash
# 启动外卖账号管理系统
cd "$(dirname "$0")"
electron .
`;
  
  fs.writeFileSync(path.join(outputDir, 'start.sh'), startScript);
  execSync(`chmod +x ${path.join(outputDir, 'start.sh')}`, { stdio: 'inherit' });
  
  // 创建Windows批处理文件
  const batchScript = `@echo off
REM 启动外卖账号管理系统
cd %~dp0
electron .
`;
  
  fs.writeFileSync(path.join(outputDir, 'start.bat'), batchScript);
  
  // 创建简单的README
  const readmeContent = `# ${appName} v${appVersion}

## 使用方法

### Windows
双击 start.bat 文件启动应用

### macOS/Linux
在终端中执行 ./start.sh 启动应用

## 注意事项
使用此应用需要安装Electron。如果尚未安装，请执行:
\`\`\`
npm install -g electron
\`\`\`

## 版本信息
当前版本: ${appVersion}
`;
  
  fs.writeFileSync(path.join(outputDir, 'README.md'), readmeContent);
  
  // 创建ZIP压缩包
  console.log('创建ZIP压缩包...');
  const zipFileName = `${appName}-${appVersion}.zip`;
  execSync(`cd ${outputDir} && cd .. && zip -r ${zipFileName} simple-package`, { stdio: 'inherit' });
  
  console.log(`\n打包完成！`);
  console.log(`输出目录: ${outputDir}`);
  console.log(`ZIP文件: ${path.join(path.dirname(outputDir), zipFileName)}`);
  
} catch (error) {
  console.error(`打包失败: ${error.message}`);
  process.exit(1);
} 