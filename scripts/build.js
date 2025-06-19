#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 获取版本信息
function getVersionInfo() {
  const versionPath = path.join(__dirname, '..', 'version.json');
  try {
    const versionData = fs.readFileSync(versionPath, 'utf8');
    return JSON.parse(versionData);
  } catch (error) {
    console.error('读取版本信息失败:', error.message);
    return { version: '1.0.0' };
  }
}

// 显示菜单
function showMenu() {
  const versionInfo = getVersionInfo();
  console.log(`\n外卖账号管理系统 - 打包工具 (v${versionInfo.version})\n`);
  console.log('请选择打包类型:');
  console.log('1. Windows 安装包 (NSIS)');
  console.log('2. Windows 便携版 (Portable)');
  console.log('3. macOS 安装包 (DMG)');
  console.log('4. Linux 安装包 (AppImage)');
  console.log('5. 所有平台');
  console.log('6. 退出');
  
  rl.question('\n请选择 (1-6): ', (answer) => {
    switch (answer) {
      case '1':
        buildWindows('nsis');
        break;
      case '2':
        buildWindows('portable');
        break;
      case '3':
        buildMac();
        break;
      case '4':
        buildLinux();
        break;
      case '5':
        buildAll();
        break;
      case '6':
        rl.close();
        break;
      default:
        console.log('无效的选择，请重试');
        showMenu();
        break;
    }
  });
}

// 构建Windows版本
function buildWindows(target = 'nsis') {
  console.log(`\n开始构建 Windows ${target === 'nsis' ? '安装包' : '便携版'}...`);
  try {
    const command = `npx electron-builder --win ${target}`;
    execSync(command, { stdio: 'inherit' });
    console.log(`\nWindows ${target === 'nsis' ? '安装包' : '便携版'}构建完成!`);
    console.log(`输出目录: ${path.join(__dirname, '..', 'dist')}`);
    rl.question('\n按Enter键返回主菜单...', () => {
      showMenu();
    });
  } catch (error) {
    console.error(`构建失败: ${error.message}`);
    rl.question('\n按Enter键返回主菜单...', () => {
      showMenu();
    });
  }
}

// 构建macOS版本
function buildMac() {
  console.log('\n开始构建 macOS 安装包...');
  try {
    execSync('npx electron-builder --mac', { stdio: 'inherit' });
    console.log('\nmacOS 安装包构建完成!');
    console.log(`输出目录: ${path.join(__dirname, '..', 'dist')}`);
    rl.question('\n按Enter键返回主菜单...', () => {
      showMenu();
    });
  } catch (error) {
    console.error(`构建失败: ${error.message}`);
    rl.question('\n按Enter键返回主菜单...', () => {
      showMenu();
    });
  }
}

// 构建Linux版本
function buildLinux() {
  console.log('\n开始构建 Linux 安装包...');
  try {
    execSync('npx electron-builder --linux', { stdio: 'inherit' });
    console.log('\nLinux 安装包构建完成!');
    console.log(`输出目录: ${path.join(__dirname, '..', 'dist')}`);
    rl.question('\n按Enter键返回主菜单...', () => {
      showMenu();
    });
  } catch (error) {
    console.error(`构建失败: ${error.message}`);
    rl.question('\n按Enter键返回主菜单...', () => {
      showMenu();
    });
  }
}

// 构建所有平台
function buildAll() {
  console.log('\n开始构建所有平台的安装包...');
  try {
    execSync('npx electron-builder --mac --win --linux', { stdio: 'inherit' });
    console.log('\n所有平台的安装包构建完成!');
    console.log(`输出目录: ${path.join(__dirname, '..', 'dist')}`);
    rl.question('\n按Enter键返回主菜单...', () => {
      showMenu();
    });
  } catch (error) {
    console.error(`构建失败: ${error.message}`);
    rl.question('\n按Enter键返回主菜单...', () => {
      showMenu();
    });
  }
}

// 启动菜单
showMenu(); 