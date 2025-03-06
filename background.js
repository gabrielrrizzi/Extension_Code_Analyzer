chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
      id: "analyzeCode",
      title: "Analyze Code",
      contexts: ["selection"]
  });
  
  chrome.storage.local.set({
      mode: "manual", 
      lastAnalysis: null,
      lastCode: null
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeCode" && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "getSelectedCode" })
      .catch((err) => {
        console.error("Could not establish connection:", err);
      });
  }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeSelectedCode" || request.action === "analyzeDetectedCode") {
      chrome.storage.local.get(['enableAi', 'openaiApiKey'], function(data) {
          if (data.enableAi && data.openaiApiKey) {
              analyzeCodeWithAI(request.code, data.openaiApiKey)
                  .then((analysis) => {
                      sendAnalysisResult(analysis, sender, request);
                  })
                  .catch((error) => {
                      console.error("AI Analysis Error: ", error);

                      const analysis = analyzeCode(request.code);
                      sendAnalysisResult(analysis, sender, request);
                  });
          } else {

              const analysis = analyzeCode(request.code);
              sendAnalysisResult(analysis, sender, request);
          }
      });
  }
  
  if (request.action === "setMode") {
      chrome.storage.local.set({ mode: request.mode });

      chrome.tabs.query({}, function(tabs) {
          tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, { 
                  action: "modeChanged", 
                  mode: request.mode 
              });
          });
      });
  }
});

function sendAnalysisResult(analysis, sender, request) {

  chrome.tabs.sendMessage(sender.tab.id, {
      action: "displayAnalysisResult",
      analysis: analysis,
      mode: request.mode,
      codePosition: request.codePosition
  });
  
  chrome.runtime.sendMessage({
      action: "updatePopup",
      analysis: analysis,
      code: request.code
  });
  
  chrome.storage.local.set({
      lastAnalysis: analysis,
      lastCode: request.code
  });
}

async function analyzeCodeWithAI(code, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
              { role: 'system', content: 'You are a code analysis expert in appsec and have to classify the code input by the user. Please return in the json format: {"Message":(Explain in one setence why the code is vulnerable or not),"Severity":(Works Fine, Malicious, Vulnerable and Code Smell)' },
              { role: 'user', content: `Analyze this code:\n${code}` }
          ],
          max_tokens: 500,
          temperature: 0.3
      })
  });
  
  if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
  }
  
  const data = await response.json();

  const jsonObject = JSON.parse(data.choices[0].message.content);

  return {
      classification: jsonObject.Severity,
      details: [{
          type: "AI Feedback",
          message: jsonObject.Message,
          severity: "info"
      }],
      score: 0
  };
}


function analyzeCode(code) {
  const analysis = {
      classification: "Works Fine",
      details: [],
      score: 0
  };
  
  const maliciousPatterns = [
      { regex: /eval\s*\(/i, message: "Use of eval() can execute arbitrary code", severity: "high" },
      { regex: /document\.write\s*\(/i, message: "document.write() can be used for XSS attacks", severity: "high" },
      { regex: /innerhtml\s*=/i, message: "innerHTML assignment without sanitization", severity: "medium" },
      { regex: /exec\s*\(/i, message: "Potential command execution", severity: "high" },
      { regex: /base64decode/i, message: "Base64 decoding might indicate obfuscated malicious code", severity: "medium" },
      { regex: /fromcharcode/i, message: "String.fromCharCode might be used to obfuscate malicious code", severity: "medium" },
      { regex: /\bfunction\s*\(\s*\)\s*\{\s*return\s*false\s*\}/i, message: "Function disabling user actions", severity: "low" }
  ];
  
  const codeSmellPatterns = [
      { regex: /var\s+[a-zA-Z0-9_$]+\s*=\s*[a-zA-Z0-9_$]+\s*\+\s*[0-9]+/i, message: "Magic numbers in code", severity: "low" },
      { regex: /function\s+[a-zA-Z0-9_$]+\s*\([^)]{100,}\)/i, message: "Function with too many parameters", severity: "medium" },
      { regex: /\/\/\s*TODO/i, message: "TODO comment in code", severity: "low" },
      { regex: /console\.log/i, message: "Console.log statements in production code", severity: "low" },
      { regex: /if\s*\(\s*true\s*\)/i, message: "Hardcoded condition (if true)", severity: "medium" },
      { regex: /if\s*\([^)]{150,}\)/i, message: "Overly complex conditional", severity: "medium" },
      { regex: /setTimeout\s*\(\s*function\s*\(\s*\)\s*\{[\s\S]{300,}\}\s*,/i, message: "Large function in setTimeout", severity: "medium" }
  ];
  
   const vulnerabilityPatterns = [
      { regex: /sql\s*=\s*['"`][^'"`]*\$\{/i, message: "Potential SQL injection", severity: "high" },
      { regex: /password|passwd|pwd/i, message: "Hardcoded password or credentials", severity: "high" },
      { regex: /Math\.random\(\)/i, message: "Insecure random number generation", severity: "medium" },
      { regex: /sessionStorage|localStorage/i, message: "Sensitive data in browser storage", severity: "medium" },
      { regex: /http:\/\//i, message: "Insecure HTTP protocol", severity: "medium" },
      { regex: /cors|crossorigin/i, message: "Potentially insecure CORS configuration", severity: "medium" },
      { regex: /debugger/i, message: "Debugger statement in code", severity: "low" }
  ];
  
  [...maliciousPatterns, ...codeSmellPatterns, ...vulnerabilityPatterns].forEach(pattern => {
      if (pattern.regex.test(code)) {
          analysis.details.push({
              type: pattern.severity === "high" ? "Malicious" : pattern.severity === "medium" ? "Vulnerability" : "Code Smell",
              message: pattern.message,
              severity: pattern.severity
          });
          analysis.score += (pattern.severity === "high" ? 10 : pattern.severity === "medium" ? 5 : 2);
      }
  });
  
  analysis.classification = analysis.score >= 10 ? "Malicious" : analysis.score >= 7 ? "Vulnerable" : analysis.score >= 3 ? "Code Smells" : "Works Fine";
  return analysis;
}


  