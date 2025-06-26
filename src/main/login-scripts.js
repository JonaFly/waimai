/**
 * 登录脚本集合
 * 包含各平台的登录自动化脚本
 */

/**
 * 创建美团平台的登录脚本
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {string} - 注入脚本代码
 */
function createMeituanLoginScript(username, password) {
  // 对用户名和密码进行特殊处理，避免字符串注入问题
  var safeUsername = JSON.stringify(username);
  var safePassword = JSON.stringify(password);

  var script = `
    (function() {
      console.log('检测到美团平台，使用特殊处理流程');

      function getElementByXPath(xpath) {
        return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      }

      // 寻找用户名输入框 - 使用多种方法确保找到
      function findUsernameInput() {
        // 1. 使用XPath - 这是最精确的方式
        var input = getElementByXPath('//input[@placeholder="请输入账号"]');
        if (input) {
          console.log('1. 通过XPath精确匹配找到用户名输入框');
          return input;
        }
        
        // 2. 尝试通过属性选择器
        input = document.querySelector('input[placeholder="请输入账号"]');
        if (input) {
          console.log('2. 通过属性选择器找到用户名输入框');
          return input;
        }
        
        // 3. 尝试通过type属性
        var textInputs = document.querySelectorAll('input[type="text"]');
        if (textInputs.length > 0) {
          console.log('3. 使用第一个文本输入框作为用户名框');
          return textInputs[0];
        }
        
        // 4. 尝试通过顺序查找（所有输入框中的第一个非密码框）
        var allInputs = document.getElementsByTagName('input');
        for (var i = 0; i < allInputs.length; i++) {
          if (allInputs[i].type !== 'password' && allInputs[i].type !== 'checkbox') {
            console.log('4. 通过排除法找到用户名输入框');
            return allInputs[i];
          }
        }
        
        console.log('未找到用户名输入框');
        return null;
      }

      // 寻找密码输入框 - 使用多种方法确保找到
      function findPasswordInput() {
        // 1. 使用XPath - 这是最精确的方式
        var input = getElementByXPath('//input[@placeholder="请输入密码"]');
        if (input) {
          console.log('1. 通过XPath精确匹配找到密码输入框');
          return input;
        }
        
        // 2. 尝试通过属性选择器
        input = document.querySelector('input[placeholder="请输入密码"]');
        if (input) {
          console.log('2. 通过属性选择器找到密码输入框');
          return input;
        }
        
        // 3. 尝试通过type属性（最可靠的方式之一）
        var pwdInputs = document.querySelectorAll('input[type="password"]');
        if (pwdInputs.length > 0) {
          console.log('3. 通过type=password找到密码输入框');
          return pwdInputs[0];
        }
        
        console.log('未找到密码输入框');
        return null;
      }

      // 获取输入框
      var usernameInput = findUsernameInput();
      var passwordInput = findPasswordInput();

      // 填充账号密码
      function fillCredentialsByAllMeans() {
        console.log('开始尝试填充账号密码 - 使用最稳定的简化版本');
        
        if (!usernameInput || !passwordInput) {
          console.error('关键输入框未找到，无法自动填充');
          return false;
        }
        
        try {
          // 保存用户名和密码到window对象，用于后续操作
          window._formData = {
            username: ${safeUsername},
            password: ${safePassword},
            lastFill: Date.now()
          };
          
          // 清除定时器（如果存在）
          if (window._fillInterval) {
            clearInterval(window._fillInterval);
          }
          
          // 直接设置用户名和密码
          usernameInput.value = ${safeUsername};
          passwordInput.value = ${safePassword};
          
          // 触发必要的事件
          usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
          usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          console.log('已直接填充用户名和密码');
          
          // 创建定时器，持续监控并恢复输入值
          window._fillInterval = setInterval(function() {
            try {
              const now = Date.now();
              const elapsed = now - window._formData.lastFill;
              
              // 只在10秒内执行恢复操作（延长时间）
              if (elapsed > 10000) {
                clearInterval(window._fillInterval);
                console.log('停止监控输入值');
                return;
              }
              
              // 检查用户名输入框
              if (usernameInput && (!usernameInput.value || usernameInput.value !== window._formData.username)) {
                console.log('恢复用户名输入值');
                usernameInput.value = window._formData.username;
                usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
                usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
                window._formData.lastFill = now;
              }
              
              // 检查密码输入框
              if (passwordInput && (!passwordInput.value || passwordInput.value !== window._formData.password)) {
                console.log('恢复密码输入值');
                passwordInput.value = window._formData.password;
                passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                window._formData.lastFill = now;
              }
            } catch (e) {
              console.error('监控输入值出错:', e);
            }
          }, 100); // 100毫秒监控一次
          
          // 提交表单前清除定时器
          const originalSubmit = HTMLFormElement.prototype.submit;
          HTMLFormElement.prototype.submit = function() {
            if (window._fillInterval) {
              clearInterval(window._fillInterval);
              console.log('提交表单前清除定时器');
            }
            return originalSubmit.apply(this, arguments);
          };
          
          return true;
        } catch (err) {
          console.error('填充凭证失败: ' + err.message);
          return false;
        }
      }

      // 处理同意协议复选框
      function handleCheckbox() {
        console.log('处理同意协议复选框');
        
        // 方法1：查找实际的复选框元素（可能被隐藏）
        var checkboxes = document.querySelectorAll('input[type="checkbox"]');
        console.log('找到复选框数量:', checkboxes.length);
        
        if (checkboxes.length > 0) {
          var checkboxHandled = false;
          
          for (var i = 0; i < checkboxes.length; i++) {
            try {
              console.log('处理复选框', i, '当前状态:', checkboxes[i].checked);
              
              // 如果已经是选中状态则跳过
              if (checkboxes[i].checked) {
                console.log('复选框', i, '已经是选中状态，跳过');
                checkboxHandled = true;
                continue;
              }
              
              // 直接设置checked属性
              checkboxes[i].checked = true;
              
              // 使用多种事件通知状态变化
              ['change', 'input', 'click'].forEach(function(eventType) {
                try {
                  checkboxes[i].dispatchEvent(new Event(eventType, { bubbles: true }));
                } catch (e) {
                  console.error('触发', eventType, '事件失败:', e);
                }
              });
              
              console.log('复选框', i, '处理完成，新状态:', checkboxes[i].checked);
              checkboxHandled = true;
            } catch (err) {
              console.error('处理复选框', i, '时出错:', err);
            }
          }
          
          if (checkboxHandled) {
            return true;
          }
        }
        
        // 如果没有通过常规方法处理成功，继续尝试其他方法
        
        // 方法2：精确点击"我已阅读并同意"文本前面的复选框区域
        var agreeContainer = null;
        
        // 通过包含文本查找
        var elements = document.querySelectorAll('*');
        for (var i = 0; i < elements.length; i++) {
          if (elements[i].textContent && 
              (elements[i].textContent.includes('我已阅读并同意') || 
               elements[i].textContent.includes('已阅读并同意'))) {
            agreeContainer = elements[i];
            console.log('找到同意协议容器:', elements[i].tagName, elements[i].className);
            break;
          }
        }
        
        // 如果找到包含文本的元素
        if (agreeContainer) {
          try {
            console.log('尝试处理协议容器');
            // 尝试找到协议容器内部的复选框
            var containerCheckbox = agreeContainer.querySelector('input[type="checkbox"]');
            if (containerCheckbox) {
              console.log('在协议容器内找到复选框元素');
              containerCheckbox.checked = true;
              ['change', 'input', 'click'].forEach(function(eventType) {
                containerCheckbox.dispatchEvent(new Event(eventType, { bubbles: true }));
              });
              return true;
            }
            
            // 更精确的点击位置计算
            var rect = agreeContainer.getBoundingClientRect();
            // 点击位置更靠近左侧边缘（文本前方的复选框位置）
            var x = rect.left + 8; // 更靠近左侧
            var y = rect.top + rect.height / 2;
            
            console.log('精确点击复选框位置:', x, y);
            
            // 尝试通过elementFromPoint找到具体的点击元素
            var elementAtPoint = document.elementFromPoint(x, y);
            if (elementAtPoint) {
              console.log('在指定位置找到元素:', elementAtPoint.tagName, elementAtPoint.className);
              
              // 如果是复选框元素，直接设置其checked属性
              if (elementAtPoint.tagName === 'INPUT' && elementAtPoint.type === 'checkbox') {
                elementAtPoint.checked = true;
                elementAtPoint.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('直接设置复选框状态为选中');
              } else {
                // 直接点击找到的元素
                elementAtPoint.click();
                console.log('已直接点击复选框位置元素');
              }
              return true;
            } else {
              // 如果没有找到具体元素，使用事件模拟点击
              var clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
              });
              
              agreeContainer.dispatchEvent(clickEvent);
              console.log('已通过事件模拟点击协议区域左侧位置');
              return true;
            }
          } catch (e) {
            console.error('点击复选框失败:', e);
          }
        }
        
        // 方法3：尝试查找隐藏的复选框或特殊标记的元素
        try {
          console.log('尝试查找特殊复选框元素');
          // 查找包含特定样式类的元素
          var specialElements = document.querySelectorAll('[class*="checkbox"], [class*="check"], [class*="agree"], .checkbox, .check');
          
          if (specialElements.length > 0) {
            console.log('找到特殊元素数量:', specialElements.length);
            
            for (var k = 0; k < specialElements.length; k++) {
              console.log('尝试点击特殊元素:', specialElements[k].tagName, specialElements[k].className);
              
              // 如果是复选框，直接设置checked属性
              if (specialElements[k].tagName === 'INPUT' && specialElements[k].type === 'checkbox') {
                specialElements[k].checked = true;
                specialElements[k].dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                // 否则尝试点击元素
                specialElements[k].click();
              }
              
              console.log('已处理特殊元素');
            }
            return true;
          }
        } catch (err) {
          console.error('尝试特殊元素失败:', err);
        }
        
        console.log('所有方法都未能找到并点击同意协议复选框');
        return false;
      }

      // 点击登录按钮
      function clickLoginButton() {
        // 查找登录按钮
        var loginButton = document.querySelector('button');
        if (!loginButton) {
          loginButton = document.querySelector('.login-button');
        }
        if (!loginButton) {
          var buttons = document.querySelectorAll('button');
          for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].textContent.includes('登录')) {
              loginButton = buttons[i];
              break;
            }
          }
        }

        if (loginButton) {
          console.log('找到登录按钮');
          
          try {
            // 在点击前保存当前的用户名和密码值
            var currentUsernameInput = findUsernameInput();
            var currentPasswordInput = findPasswordInput();
            
            // 使用前面保存的表单数据或当前输入框的值
            var savedUsername = window._formData ? window._formData.username : 
                             (currentUsernameInput ? currentUsernameInput.value : '');
            var savedPassword = window._formData ? window._formData.password : 
                             (currentPasswordInput ? currentPasswordInput.value : '');
            
            console.log('已保存当前输入框状态，准备点击登录按钮');
            
            // 在DOM中隐藏真实值，用于检测和恢复
            if (!window._savedLoginData) {
              window._savedLoginData = {
                username: savedUsername,
                password: savedPassword,
                recoveryAttempts: 0,
                lastRecovery: Date.now()
              };
            }
            
            // 创建恢复输入值的函数
            function ensureInputValues() {
              // 限制恢复尝试次数，避免无限循环
              if (window._savedLoginData.recoveryAttempts > 10 || 
                  Date.now() - window._savedLoginData.lastRecovery > 10000) {
                return;
              }
              
              window._savedLoginData.recoveryAttempts++;
              window._savedLoginData.lastRecovery = Date.now();
              
              var usernameInput = findUsernameInput();
              var passwordInput = findPasswordInput();
              
              if (usernameInput && (!usernameInput.value || usernameInput.value !== window._savedLoginData.username)) {
                console.log('恢复用户名输入');
                usernameInput.value = window._savedLoginData.username;
                usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
                usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
              }
              
              if (passwordInput && (!passwordInput.value || passwordInput.value !== window._savedLoginData.password)) {
                console.log('恢复密码输入');
                passwordInput.value = window._savedLoginData.password;
                passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            
            // 修改登录按钮的点击处理方式
            var form = loginButton.closest('form');
            
            if (form) {
              console.log('登录按钮在表单内，准备处理表单提交');
              
              // 保存原始的表单提交处理
              var originalSubmit = form.onsubmit;
              
              // 覆盖表单提交处理
              form.onsubmit = function(e) {
                // 阻止默认提交
                e.preventDefault();
                
                // 确保输入框有正确的值
                ensureInputValues();
                
                // 尝试通过XHR直接提交数据
                try {
                  console.log('尝试通过XHR直接提交表单数据');
                  
                  var formData = new FormData(form);
                  // 确保表单数据包含我们保存的用户名和密码
                  if (!formData.has('username') && !formData.has('account') && !formData.has('mobile')) {
                    // 尝试找到正确的字段名
                    var usernameField = '';
                    var inputs = form.querySelectorAll('input');
                    for (var i = 0; i < inputs.length; i++) {
                      if (inputs[i].type !== 'password' && inputs[i].type !== 'checkbox' && inputs[i].name) {
                        usernameField = inputs[i].name;
                        break;
                      }
                    }
                    
                    if (usernameField) {
                      formData.append(usernameField, window._savedLoginData.username);
                    } else {
                      // 尝试常见的用户名字段
                      ['username', 'account', 'mobile', 'user', 'email', 'phone'].forEach(function(field) {
                        formData.append(field, window._savedLoginData.username);
                      });
                    }
                  }
                  
                  if (!formData.has('password')) {
                    formData.append('password', window._savedLoginData.password);
                  }
                  
                  // 获取表单的action URL
                  var actionUrl = form.action || window.location.href;
                  
                  // 发送XHR请求
                  var xhr = new XMLHttpRequest();
                  xhr.open(form.method || 'POST', actionUrl, true);
                  xhr.withCredentials = true;
                  xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                      if (xhr.status >= 200 && xhr.status < 300) {
                        console.log('XHR表单提交成功');
                        try {
                          // 尝试解析响应
                          var response = JSON.parse(xhr.responseText);
                          if (response.data && response.data.redirect_url) {
                            window.location.href = response.data.redirect_url;
                          } else {
                            window.location.reload();
                          }
                        } catch (e) {
                          // 响应不是JSON，刷新页面
                          window.location.reload();
                        }
                      } else {
                        console.log('XHR表单提交失败，尝试原始点击');
                        // 恢复输入值并点击
                        ensureInputValues();
                        loginButton.click();
                      }
                    }
                  };
                  
                  xhr.onerror = function() {
                    console.log('XHR请求出错，尝试原始点击');
                    ensureInputValues();
                    loginButton.click();
                  };
                  
                  xhr.send(formData);
                  
                } catch (err) {
                  console.error('XHR提交失败:', err);
                  // 如果XHR提交失败，尝试原始提交方式
                  ensureInputValues();
                  
                  // 恢复原始的表单提交处理
                  form.onsubmit = originalSubmit;
                  
                  // 点击登录按钮
                  setTimeout(function() {
                    loginButton.click();
                  }, 100);
                }
                
                return false;
              };
              
              // 提交表单
              try {
                form.requestSubmit();
              } catch (e) {
                form.submit();
              }
              console.log('已触发表单提交');
              
            } else {
              // 如果没有表单，添加登录按钮点击事件
              console.log('没有找到表单，设置点击事件');
              
              // 保存原始点击事件
              var originalClick = loginButton.onclick;
              
              // 替换点击事件
              loginButton.onclick = function(e) {
                // 阻止默认行为
                e.preventDefault();
                
                // 确保输入框有正确的值
                ensureInputValues();
                
                // 调用原始点击事件
                if (originalClick) {
                  originalClick.call(this, e);
                }
                
                // 设置定时器确保值不会被清除
                var recoveryInterval = setInterval(function() {
                  ensureInputValues();
                  
                  // 检查是否需要停止恢复
                  if (window._savedLoginData.recoveryAttempts > 10 || 
                      Date.now() - window._savedLoginData.lastRecovery > 10000) {
                    clearInterval(recoveryInterval);
                  }
                }, 200);
                
                // 5秒后清除恢复间隔
                setTimeout(function() {
                  clearInterval(recoveryInterval);
                }, 5000);
                
                return false;
              };
              
              // 模拟点击
              var clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              loginButton.dispatchEvent(clickEvent);
              console.log('已触发登录按钮点击事件');
            }
            
            // 设置一个定时器确保输入值不会被清除
            var recoveryInterval = setInterval(function() {
              ensureInputValues();
              
              // 10秒后停止恢复尝试
              if (window._savedLoginData.recoveryAttempts > 10 || 
                  Date.now() - window._savedLoginData.lastRecovery > 10000) {
                clearInterval(recoveryInterval);
              }
            }, 200);
            
            // 5秒后清除恢复间隔
            setTimeout(function() {
              clearInterval(recoveryInterval);
            }, 5000);
            
            return true;
          } catch (err) {
            console.error('点击登录按钮时出错:', err);
            // 出错时使用原始方法
            loginButton.click();
            return true;
          }
        } else {
          console.log('未找到登录按钮');
          return false;
        }
      }

      // 主执行流程
      console.log('开始执行美团登录流程');
      
      // 添加一个标记，防止重复执行
      if (window.__meituanLoginExecuted) {
        console.log('登录脚本已经执行过，跳过');
        return;
      }
      
      // 设置执行标记
      window.__meituanLoginExecuted = true;
      
      // 立即检查当前是否已登录
      if (checkLoginStatus()) {
        console.log('检测到用户已登录，无需执行登录流程');
        return;
      }
      
      // 使用XPath直接定位元素
      function getElementByXPath(xpath, doc) {
        return (doc || document).evaluate(xpath, doc || document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      }
      
      // 直接定位的XPath
      const XPATH = {
        username: '/html/body/div[1]/div/div[2]/div/div/form/div[1]/div[1]/input',
        password: '/html/body/div[1]/div/div[2]/div/div/form/div[2]/div/input',
        checkbox: '/html/body/div[1]/div/div[2]/div/div/form/div[4]/div/div/label',
        loginButton: '/html/body/div[1]/div/div[2]/div/div/form/button'
      };
      
      // 使用XPath定位所有元素
      function executeWithXPath() {
        try {
          console.log('使用XPath定位元素');
          
          // 获取元素
          const usernameInput = getElementByXPath(XPATH.username);
          const passwordInput = getElementByXPath(XPATH.password);
          const checkbox = getElementByXPath(XPATH.checkbox);
          const loginButton = getElementByXPath(XPATH.loginButton);
          
          console.log('XPath定位结果:',
            '用户名:', !!usernameInput,
            '密码:', !!passwordInput,
            '复选框:', !!checkbox,
            '登录按钮:', !!loginButton
          );
          
          if (!usernameInput || !passwordInput) {
            console.error('未找到用户名或密码输入框');
            return false;
          }
          
          // 填充用户名和密码
          usernameInput.value = ${safeUsername};
          usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
          usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          passwordInput.value = ${safePassword};
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          console.log('成功填充用户名和密码');
          
          // 处理复选框
          setTimeout(function() {
            try {
              if (checkbox) {
                checkbox.click();
                console.log('已点击同意协议复选框');
              } else {
                console.warn('未找到同意协议复选框');
                // 尝试通过其他方式处理复选框
                handleCheckbox();
              }
              
              // 点击登录按钮
              setTimeout(function() {
                if (loginButton) {
                  // 登录前设置持久化存储
                  try {
                    // 设置localStorage持久化标记
                    localStorage.setItem('_mt_login_persistent', 'true');
                    localStorage.setItem('_mt_login_username', ${safeUsername});
                    localStorage.setItem('_mt_login_timestamp', Date.now());
                    
                    // 尝试设置cookie
                    document.cookie = "remember_me=true; expires=" + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString() + "; path=/";
                    document.cookie = "keep_login=true; expires=" + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString() + "; path=/";
                    
                    console.log('已设置持久化存储标记');
                  } catch (e) {
                    console.error('设置持久化存储失败:', e);
                  }
                  
                  loginButton.click();
                  console.log('已点击登录按钮');
                  
                  // 登录后监听页面变化，确保会话保持
                  setupLoginSuccessMonitor();
                } else {
                  console.error('未找到登录按钮');
                  // 尝试通过其他方式点击登录按钮
                  clickLoginButton();
                }
              }, 500);
            } catch (e) {
              console.error('处理复选框或登录按钮时出错:', e);
            }
          }, 500);
          
          return true;
        } catch (e) {
          console.error('XPath执行出错:', e);
          return false;
        }
      }
      
      // 设置登录成功后的监控
      function setupLoginSuccessMonitor() {
        // 创建MutationObserver监听DOM变化
        const observer = new MutationObserver(function(mutations) {
          // 检查是否已经登录成功
          checkLoginStatus();
        });
        
        // 开始观察文档变化
        observer.observe(document, { 
          childList: true, 
          subtree: true,
          attributes: true,
          characterData: true
        });
        
        // 5分钟后停止观察
        setTimeout(function() {
          observer.disconnect();
        }, 300000);
      }
      
      // 检查登录状态的新函数
      function checkLoginStatus() {
        console.log('检查登录状态...');
        
        // 检查是否存在"全部门店"元素
        const allStoresElement = document.querySelector('.全部门店') || 
                                 document.querySelector('*:contains("全部门店")') ||
                                 Array.from(document.querySelectorAll('*')).find(el => 
                                   el.textContent && el.textContent.includes('全部门店')
                                 );
        
        // 检查其他后台特有元素
        const otherElements = document.querySelector('.商家首页') || 
                              document.querySelector('*:contains("商家首页")') ||
                              document.querySelector('.订单管理') ||
                              document.querySelector('*:contains("订单管理")') ||
                              document.querySelector('.商品管理') ||
                              document.querySelector('*:contains("商品管理")');
        
        if (allStoresElement || otherElements) {
          console.log('检测到登录成功特征元素，用户已登录');
          
          try {
            // 设置更多持久化存储
            localStorage.setItem('_mt_login_status', 'logged_in');
            sessionStorage.setItem('_mt_session_active', 'true');
            
            // 向父窗口发送登录成功消息
            window.parent.postMessage({
              type: 'LOGIN_STATUS',
              status: 'success',
              platform: 'meituan',
              timestamp: Date.now()
            }, '*');
            
            // 每30秒刷新一次会话状态
            setInterval(function() {
              try {
                // 更新时间戳
                localStorage.setItem('_mt_login_timestamp', Date.now());
                console.log('已刷新会话状态');
                
                // 持续向父窗口发送登录状态
                window.parent.postMessage({
                  type: 'LOGIN_STATUS',
                  status: 'active',
                  platform: 'meituan',
                  timestamp: Date.now()
                }, '*');
              } catch (e) {
                console.error('刷新会话状态失败:', e);
              }
            }, 30000);
            
            return true;
          } catch (e) {
            console.error('设置登录成功后的持久化存储失败:', e);
          }
        } else {
          console.log('未检测到登录成功特征元素，用户可能未登录');
          return false;
        }
      }
      
      // 尝试在iframe中执行XPath查找
      function tryInIframes() {
        const iframes = document.querySelectorAll('iframe');
        console.log('查找iframe, 数量:', iframes.length);
        
        if (iframes.length === 0) {
          return false;
        }
        
        let success = false;
        
        for (let i = 0; i < iframes.length; i++) {
          try {
            const frame = iframes[i];
            console.log('尝试在iframe', i, '中执行XPath');
            
            if (!frame.contentDocument || !frame.contentWindow) {
              continue;
            }
            
            // 在iframe中获取元素
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            
            const usernameInput = getElementByXPath(XPATH.username, doc);
            const passwordInput = getElementByXPath(XPATH.password, doc);
            const checkbox = getElementByXPath(XPATH.checkbox, doc);
            const loginButton = getElementByXPath(XPATH.loginButton, doc);
            
            console.log('iframe', i, 'XPath定位结果:',
              '用户名:', !!usernameInput,
              '密码:', !!passwordInput,
              '复选框:', !!checkbox,
              '登录按钮:', !!loginButton
            );
            
            if (!usernameInput || !passwordInput) {
              continue;
            }
            
            // 填充用户名和密码
            usernameInput.value = ${safeUsername};
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            passwordInput.value = ${safePassword};
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            console.log('成功在iframe', i, '中填充用户名和密码');
            
            // 处理复选框和登录按钮
            setTimeout(function() {
              if (checkbox) {
                checkbox.click();
                console.log('已在iframe中点击复选框');
              }
              
              setTimeout(function() {
                if (loginButton) {
                  loginButton.click();
                  console.log('已在iframe中点击登录按钮');
                }
              }, 500);
            }, 500);
            
            success = true;
            break;
          } catch (e) {
            console.error('iframe', i, '执行失败:', e);
          }
        }
        
        return success;
      }
      
      // 先在主文档中尝试
      let success = executeWithXPath();
      
      // 如果主文档中失败，尝试在iframe中执行
      if (!success) {
        console.log('主文档中定位失败，尝试在iframe中定位');
        success = tryInIframes();
      }
      
      // 如果XPath方法都失败，尝试使用通用方法
      if (!success) {
        console.log('XPath方法失败，尝试使用通用方法');
        fillCredentialsByAllMeans();
        handleCheckbox();
        setTimeout(clickLoginButton, 1000);
      }
      
      // 报告执行结果
      console.log('登录执行结果:', success ? '成功' : '使用备用方法');
      
      // 设置页面卸载前的处理
      window.addEventListener('beforeunload', function() {
        // 保存会话状态到localStorage
        try {
          localStorage.setItem('_mt_session_state', JSON.stringify({
            username: ${safeUsername},
            timestamp: Date.now(),
            isLoggedIn: true
          }));
        } catch (e) {
          console.error('保存会话状态失败:', e);
        }
      });
      
      // 一分钟后重置执行标记
      setTimeout(function() {
        window.__meituanLoginExecuted = false;
        console.log('重置执行标记，允许下次执行');
      }, 60000);
    })();
  `;

  return script;
}

/**
 * 创建标准登录脚本
 * @param {string} username - 用户名 
 * @param {string} password - 密码
 * @returns {string} - 注入脚本代码
 */
function createStandardLoginScript(username, password) {
  // 将用户名和密码转换为JSON字符串，以便在模板字符串中正确处理
  const escapedUsername = JSON.stringify(username);
  const escapedPassword = JSON.stringify(password);
  
  return `
  (function() {
    try {
      console.log('执行标准登录流程');
      
      // 各种选择器
      var usernameSelectors = [
        'input[type="text"]', 
        'input[name="username"]', 
        'input[name="account"]', 
        'input[name="mobile"]',
        'input[placeholder*="账号"]',
        'input[placeholder*="用户名"]',
        'input[placeholder*="手机"]',
        'input.username',
        '#username',
        '#account',
        '#mobile'
      ];
      
      var passwordSelectors = [
        'input[type="password"]', 
        'input[name="password"]',
        'input[placeholder*="密码"]',
        'input.password',
        '#password'
      ];
      
      var buttonSelectors = [
        'button[type="submit"]', 
        'button.login', 
        'input[type="submit"]', 
        '.btn-login', 
        '.login-btn',
        'button[class*="login"]',
        'button[class*="submit"]',
        'a.login',
        'a[class*="login"]'
      ];
      
      // 尝试查找用户名输入框
      var usernameInput = null;
      for (var i = 0; i < usernameSelectors.length; i++) {
        var input = document.querySelector(usernameSelectors[i]);
        if (input) {
          usernameInput = input;
          console.log('找到用户名输入框: ' + usernameSelectors[i]);
          break;
        }
      }
      
      // 尝试查找密码输入框
      var passwordInput = null;
      for (var i = 0; i < passwordSelectors.length; i++) {
        var input = document.querySelector(passwordSelectors[i]);
        if (input) {
          passwordInput = input;
          console.log('找到密码输入框: ' + passwordSelectors[i]);
          break;
        }
      }
      
      // 尝试查找登录按钮
      var loginButton = null;
      for (var i = 0; i < buttonSelectors.length; i++) {
        try {
          var button = document.querySelector(buttonSelectors[i]);
          if (button) {
            loginButton = button;
            console.log('找到登录按钮: ' + buttonSelectors[i]);
            break;
          }
        } catch (e) {
          // 某些选择器可能不被支持，忽略错误
        }
      }
      
      // 如果没有找到登录按钮，尝试查找包含"登录"文本的按钮
      if (!loginButton) {
        var buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn'));
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          if (btn.innerText && btn.innerText.includes('登录')) {
            loginButton = btn;
            console.log('通过文本内容找到登录按钮');
            break;
          }
        }
      }
      
      if (usernameInput && passwordInput) {
        // 清除现有值并聚焦
        usernameInput.value = '';
        usernameInput.focus();
        
        // 设置用户名
        usernameInput.value = ${escapedUsername};
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // 设置密码
        passwordInput.value = '';
        passwordInput.focus();
        passwordInput.value = ${escapedPassword};
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        console.log('已填充用户名和密码');
        
        // 检查是否有需要点击的复选框（同意协议等）
        var checkboxes = document.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < checkboxes.length; i++) {
          var checkbox = checkboxes[i];
          if (!checkbox.checked && 
              ((checkbox.id && checkbox.id.toLowerCase().includes('agreement')) || 
               (checkbox.name && checkbox.name.toLowerCase().includes('agreement')) ||
               (checkbox.closest('label') && checkbox.closest('label').textContent.includes('同意')))) {
            console.log('点击同意协议复选框');
            checkbox.click();
            checkbox.checked = true;
          }
        }
        
        // 延迟点击登录按钮
        setTimeout(function() {
          if (loginButton) {
            console.log('点击登录按钮');
            loginButton.click();
          } else {
            console.warn('未找到登录按钮');
          }
        }, 1500);
        
        return true;
      } else {
        console.warn('未找到登录表单元素');
        return false;
      }
    } catch (err) {
      console.error('自动登录脚本执行出错: ' + err.message);
      return false;
    }
  })();
  `;
}

/**
 * 创建京东外卖的登录脚本
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {string} - 注入脚本代码
 */
function createJDLoginScript(username, password) {
  // 对用户名和密码进行特殊处理，避免字符串注入问题
  var safeUsername = JSON.stringify(username);
  var safePassword = JSON.stringify(password);

  var script = `
    (function() {
      console.log('检测到京东外卖平台，使用京东专用处理流程');
      
      function waitForElement(selector, maxWaitTime) {
        return new Promise((resolve) => {
          if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
          }
          
          const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
              observer.disconnect();
              resolve(document.querySelector(selector));
            }
          });
          
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
          
          setTimeout(() => {
            observer.disconnect();
            resolve(null);
          }, maxWaitTime || 5000);
        });
      }
      
      // 查找用户名输入框 - 京东专用方法
      function findJDUsernameInput() {
        // 京东登录页面通常使用的选择器
        var selectors = [
          'input[name="loginname"]',
          'input[name="username"]',
          'input#username',
          'input[placeholder*="账号"]',
          'input[placeholder*="用户名"]',
          'input[placeholder*="手机"]'
        ];
        
        for (var i = 0; i < selectors.length; i++) {
          var input = document.querySelector(selectors[i]);
          if (input) {
            console.log('找到京东用户名输入框:', selectors[i]);
            return input;
          }
        }
        
        // 如果以上方法都失败，尝试查找任何可能的文本输入框
        var allInputs = document.querySelectorAll('input:not([type="password"])');
        if (allInputs.length > 0) {
          for (var i = 0; i < allInputs.length; i++) {
            if (allInputs[i].type === 'text' || !allInputs[i].type) {
              console.log('通过排除法找到京东用户名输入框');
              return allInputs[i];
            }
          }
        }
        
        console.log('未找到京东用户名输入框');
        return null;
      }
      
      // 查找密码输入框 - 京东专用方法
      function findJDPasswordInput() {
        // 京东登录页的密码输入框通常很容易找到
        var pwdInput = document.querySelector('input[type="password"]');
        if (pwdInput) {
          console.log('找到京东密码输入框');
          return pwdInput;
        }
        
        console.log('未找到京东密码输入框');
        return null;
      }
      
      // 填充京东登录表单
      async function fillJDLoginForm() {
        // 等待输入框出现 - 京东有时会延迟加载登录表单
        await waitForElement('input[type="text"], input:not([type="password"])', 3000);
        await waitForElement('input[type="password"]', 3000);
        
        var usernameInput = findJDUsernameInput();
        var passwordInput = findJDPasswordInput();
        
        if (!usernameInput || !passwordInput) {
          console.error('未找到京东登录表单元素');
          return false;
        }
        
        try {
          // 清除并填写用户名
          usernameInput.value = '';
          usernameInput.focus();
          usernameInput.value = ${safeUsername};
          usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
          usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('已填写京东用户名');
          
          // 清除并填写密码
          passwordInput.value = '';
          passwordInput.focus();
          passwordInput.value = ${safePassword};
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('已填写京东密码');
          
          return true;
        } catch (err) {
          console.error('填写京东登录表单失败:', err);
          return false;
        }
      }
      
      // 处理复选框 - 京东专用
      function handleJDCheckbox() {
        // 京东登录页复选框通常具有特定的class或属性
        var checkboxes = document.querySelectorAll('input[type="checkbox"]');
        console.log('找到京东复选框数量:', checkboxes.length);
        
        if (checkboxes.length > 0) {
          for (var i = 0; i < checkboxes.length; i++) {
            try {
              if (!checkboxes[i].checked) {
                checkboxes[i].checked = true;
                checkboxes[i].dispatchEvent(new Event('change', { bubbles: true }));
                console.log('已选中京东复选框:', i);
              } else {
                console.log('京东复选框已选中，跳过:', i);
              }
            } catch (e) {
              console.error('处理京东复选框失败:', e);
            }
          }
          return true;
        }
        
        // 查找包含"同意"或"协议"的相关元素
        var agreeElements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent && (
            el.textContent.includes('同意') || 
            el.textContent.includes('协议')
          ));
        
        if (agreeElements.length > 0) {
          console.log('找到可能的京东协议元素数量:', agreeElements.length);
          for (var j = 0; j < agreeElements.length; j++) {
            try {
              // 查找元素中的复选框
              var checkboxInside = agreeElements[j].querySelector('input[type="checkbox"]');
              if (checkboxInside) {
                checkboxInside.checked = true;
                checkboxInside.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('已选中京东协议中的复选框');
                return true;
              }
              
              // 如果找不到复选框，尝试点击元素本身
              if (agreeElements[j].tagName !== 'BODY' && agreeElements[j].tagName !== 'HTML') {
                agreeElements[j].click();
                console.log('已点击京东协议元素:', agreeElements[j].tagName, agreeElements[j].className);
                return true;
              }
            } catch (e) {
              console.error('处理京东协议元素失败:', e);
            }
          }
        }
        
        console.log('未找到京东协议复选框');
        return false;
      }
      
      // 点击京东登录按钮
      function clickJDLoginButton() {
        var loginButton = null;
        
        // 尝试多种方法查找登录按钮
        var buttonSelectors = [
          'button[type="submit"]',
          'button.login-btn',
          'a.login-btn',
          'input[type="submit"]'
        ];
        
        for (var i = 0; i < buttonSelectors.length; i++) {
          var btn = document.querySelector(buttonSelectors[i]);
          if (btn) {
            loginButton = btn;
            console.log('找到京东登录按钮:', buttonSelectors[i]);
            break;
          }
        }
        
        if (!loginButton) {
          // 查找包含"登录"文本的按钮
          var allButtons = document.querySelectorAll('button, input[type="submit"], a.btn, .btn');
          for (var j = 0; j < allButtons.length; j++) {
            if (allButtons[j].textContent && allButtons[j].textContent.includes('登录')) {
              loginButton = allButtons[j];
              console.log('通过文本找到京东登录按钮');
              break;
            }
          }
        }
        
        if (loginButton) {
          try {
            loginButton.click();
            console.log('已点击京东登录按钮');
            return true;
          } catch (e) {
            console.error('点击京东登录按钮失败:', e);
            return false;
          }
        }
        
        console.log('未找到京东登录按钮');
        return false;
      }
      
      // 执行京东登录流程
      console.log('开始执行京东登录流程');
      
      // 防止表单自动提交导致页面刷新
      var forms = document.querySelectorAll('form');
      for (var i = 0; i < forms.length; i++) {
        forms[i].addEventListener('submit', function(e) {
          e.preventDefault();
          console.log('已阻止京东表单自动提交');
          return false;
        });
      }
      
      // 填写登录表单
      fillJDLoginForm().then(function(filled) {
        if (filled) {
          // 按顺序执行：先填表单，再点复选框，最后点登录按钮
          setTimeout(function() {
            console.log('准备处理京东复选框');
            var checkboxHandled = handleJDCheckbox();
            console.log('京东复选框处理结果:', checkboxHandled);
            
            setTimeout(function() {
              console.log('准备点击京东登录按钮');
              clickJDLoginButton();
            }, 1000);
          }, 1500);
        }
      });
    })();
  `;

  return script;
}

/**
 * 根据平台选择并创建相应的登录脚本
 * @param {string} platform - 平台名称
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {string} - 注入脚本代码
 */
function createLoginScript(platform, username, password) {
  console.log('创建登录脚本，平台:', platform);
  
  // 按平台选择不同的登录逻辑
  if (platform === 'meituan') {
    return createMeituanLoginScript(username, password);
  } else if (platform === 'jd' || platform === 'jingdong') {
    return createJDLoginScript(username, password);
  } else {
    return createStandardLoginScript(username, password);
  }
}

module.exports = {
  createLoginScript
}; 