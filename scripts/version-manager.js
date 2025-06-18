#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 文件路径
const ROOT_DIR = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT_DIR, 'version.json');
const PACKAGE_JSON = path.join(ROOT_DIR, 'package.json');

// 读取版本信息
function readVersionInfo() {
  try {
    return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
  } catch (error) {
    console.error('读取版本文件失败:', error.message);
    process.exit(1);
  }
}

// 更新版本信息
function updateVersionInfo(versionInfo) {
  try {
    fs.writeFileSync(VERSION_FILE, JSON.stringify(versionInfo, null, 2), 'utf8');
    console.log(`版本信息已更新到 ${versionInfo.version}`);
  } catch (error) {
    console.error('更新版本文件失败:', error.message);
    process.exit(1);
  }
}

// 更新package.json中的版本号
function updatePackageVersion(version) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    packageJson.version = version;
    fs.writeFileSync(PACKAGE_JSON, JSON.stringify(packageJson, null, 2), 'utf8');
    console.log(`package.json 版本已更新到 ${version}`);
  } catch (error) {
    console.error('更新 package.json 失败:', error.message);
  }
}

// 创建Git标签
function createGitTag(version, message) {
  try {
    execSync(`git tag -a v${version} -m "${message}"`, { stdio: 'inherit' });
    console.log(`已创建Git标签: v${version}`);
  } catch (error) {
    console.error('创建Git标签失败:', error.message);
  }
}

// 生成发布说明
function generateReleaseNotes(versionInfo) {
  const currentVersion = versionInfo.changelog[0];
  
  let notes = `# 版本 ${currentVersion.version} (${currentVersion.date})\n\n`;
  
  notes += `## 变更\n\n`;
  currentVersion.changes.forEach(change => {
    notes += `- ${change}\n`;
  });
  
  if (versionInfo.features && versionInfo.features.length > 0) {
    notes += `\n## 功能\n\n`;
    versionInfo.features.forEach(feature => {
      notes += `- ${feature}\n`;
    });
  }
  
  const releasePath = path.join(ROOT_DIR, 'releases');
  if (!fs.existsSync(releasePath)) {
    fs.mkdirSync(releasePath, { recursive: true });
  }
  
  const releaseFile = path.join(releasePath, `v${currentVersion.version}.md`);
  fs.writeFileSync(releaseFile, notes, 'utf8');
  
  console.log(`发布说明已生成: ${releaseFile}`);
  return releaseFile;
}

// 显示版本信息
function showVersionInfo() {
  const versionInfo = readVersionInfo();
  console.log('\n当前版本信息:');
  console.log(`版本号: ${versionInfo.version}`);
  console.log(`发布日期: ${versionInfo.releaseDate}`);
  console.log(`名称: ${versionInfo.name}`);
  console.log(`描述: ${versionInfo.description}`);
  
  console.log('\n功能:');
  versionInfo.features.forEach(feature => {
    console.log(`- ${feature}`);
  });
  
  console.log('\n变更日志:');
  versionInfo.changelog.slice(0, 3).forEach(log => {
    console.log(`- ${log.version} (${log.date}): ${log.changes[0]}${log.changes.length > 1 ? ' ...' : ''}`);
  });
  
  console.log('\n计划中的功能:');
  versionInfo.upcomingFeatures.forEach(feature => {
    console.log(`- ${feature.version} ${feature.name}: ${feature.features[0]}${feature.features.length > 1 ? ' ...' : ''}`);
  });
  
  console.log('\n');
}

// 增加版本号
function incrementVersion(version, type = 'patch') {
  const parts = version.split('.');
  switch (type) {
    case 'major':
      return `${Number(parts[0]) + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${Number(parts[1]) + 1}.0`;
    case 'patch':
    default:
      return `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`;
  }
}

// 创建新版本
function createNewVersion() {
  const versionInfo = readVersionInfo();
  const currentVersion = versionInfo.version;
  
  console.log(`当前版本: ${currentVersion}`);
  console.log('版本类型:');
  console.log('1. 主版本 (不兼容的API变化)');
  console.log('2. 次版本 (向后兼容的功能新增)');
  console.log('3. 修订版本 (向后兼容的问题修复)');
  
  rl.question('请选择版本类型 (1-3): ', (answer) => {
    let versionType;
    switch (answer) {
      case '1': versionType = 'major'; break;
      case '2': versionType = 'minor'; break;
      case '3': versionType = 'patch'; break;
      default: versionType = 'patch';
    }
    
    const newVersion = incrementVersion(currentVersion, versionType);
    console.log(`新版本将是: ${newVersion}`);
    
    rl.question('版本名称: ', (name) => {
      rl.question('版本描述: ', (description) => {
        collectChanges([], (changes) => {
          collectFeatures([], (features) => {
            const today = new Date().toISOString().split('T')[0];
            
            // 更新版本信息
            versionInfo.version = newVersion;
            versionInfo.releaseDate = today;
            versionInfo.name = name;
            versionInfo.description = description;
            versionInfo.features = features;
            
            // 添加到变更日志
            versionInfo.changelog.unshift({
              version: newVersion,
              date: today,
              changes
            });
            
            updateVersionInfo(versionInfo);
            updatePackageVersion(newVersion);
            
            const releaseFile = generateReleaseNotes(versionInfo);
            
            rl.question('是否创建Git标签? (y/n): ', (answer) => {
              if (answer.toLowerCase() === 'y') {
                createGitTag(newVersion, `版本 ${newVersion}: ${name}`);
              }
              
              console.log('版本更新完成!');
              rl.close();
            });
          });
        });
      });
    });
  });
}

// 收集变更列表
function collectChanges(changes, callback) {
  rl.question(`变更 ${changes.length + 1} (留空结束): `, (answer) => {
    if (answer.trim() === '') {
      callback(changes);
    } else {
      changes.push(answer);
      collectChanges(changes, callback);
    }
  });
}

// 收集功能列表
function collectFeatures(features, callback) {
  rl.question(`功能 ${features.length + 1} (留空结束): `, (answer) => {
    if (answer.trim() === '') {
      callback(features);
    } else {
      features.push(answer);
      collectFeatures(features, callback);
    }
  });
}

// 创建发布目录
function ensureReleasesDir() {
  const releasesDir = path.join(ROOT_DIR, 'releases');
  if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir, { recursive: true });
    console.log('创建发布目录: releases/');
  }
}

// 检查是否是Git仓库
function checkGitRepo() {
  try {
    execSync('git status', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// 初始化Git仓库
function initGitRepo() {
  try {
    execSync('git init', { stdio: 'inherit' });
    console.log('Git仓库已初始化');
    
    // 创建.gitignore
    const gitignorePath = path.join(ROOT_DIR, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, `node_modules/
.DS_Store
*.log
.env
.vscode/
dist/
build/
`, 'utf8');
      console.log('.gitignore 文件已创建');
    }
  } catch (error) {
    console.error('初始化Git仓库失败:', error.message);
  }
}

// 设置分支策略
function setupBranchStrategy() {
  const isGitRepo = checkGitRepo();
  
  if (!isGitRepo) {
    console.log('未检测到Git仓库，将初始化一个新的仓库');
    initGitRepo();
  }
  
  // 确保主分支存在
  try {
    execSync('git checkout -b main 2>/dev/null || git checkout main', { stdio: 'ignore' });
    console.log('当前分支: main');
  } catch (error) {
    console.error('切换到main分支失败:', error.message);
  }
  
  console.log('\n分支策略:');
  console.log('- main: 主分支，用于发布');
  console.log('- develop: 开发分支，用于集成');
  console.log('- feature/*: 功能分支，用于开发新功能');
  console.log('- release/*: 发布分支，用于准备发布');
  console.log('- hotfix/*: 热修复分支，用于紧急修复');
  
  rl.question('\n是否创建基本分支结构? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      try {
        // 创建develop分支
        execSync('git checkout -b develop 2>/dev/null || git checkout develop', { stdio: 'ignore' });
        console.log('已创建/切换到 develop 分支');
        
        // 返回main分支
        execSync('git checkout main', { stdio: 'ignore' });
        
        console.log('分支结构已设置');
      } catch (error) {
        console.error('设置分支结构失败:', error.message);
      }
    }
    
    rl.close();
  });
}

// 主菜单
function showMainMenu() {
  console.log('\n外卖账号管理系统 - 版本管理\n');
  console.log('1. 显示当前版本信息');
  console.log('2. 创建新版本');
  console.log('3. 生成当前版本发布说明');
  console.log('4. 设置分支策略');
  console.log('5. 退出');
  
  rl.question('\n请选择操作 (1-5): ', (answer) => {
    switch (answer) {
      case '1':
        showVersionInfo();
        rl.question('按Enter继续...', () => showMainMenu());
        break;
      case '2':
        createNewVersion();
        break;
      case '3':
        const releaseFile = generateReleaseNotes(readVersionInfo());
        rl.question('按Enter继续...', () => showMainMenu());
        break;
      case '4':
        setupBranchStrategy();
        break;
      case '5':
        rl.close();
        break;
      default:
        console.log('无效的选择，请重试');
        showMainMenu();
    }
  });
}

// 确保releases目录存在
ensureReleasesDir();

// 启动主菜单
showMainMenu(); 