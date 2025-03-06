document.addEventListener('DOMContentLoaded', function() {
  chrome.storage.local.get(['lastAnalysis', 'lastCode', 'enableAi', 'openaiApiKey'], function(data) {
    if (data.lastAnalysis && data.lastCode) {
      displayAnalysisResults(data.lastAnalysis, data.lastCode);
    }
    
     updateAiStatus(data.enableAi, !!data.openaiApiKey);
    
    const modeToggle = document.getElementById('mode-toggle');
    const modeDescription = document.getElementById('mode-description');
    
    chrome.storage.local.get(['mode'], function(modeData) {
      if (modeData.mode === 'automatic') {
        modeToggle.checked = true;
        modeDescription.innerHTML = '<strong>Automatic Mode:</strong> The extension will automatically detect and analyze code blocks on the page.';
      } else {
        modeToggle.checked = false;
        modeDescription.innerHTML = '<strong>Manual Mode:</strong> Right-click on selected code and choose "Analyze Code" to detect issues.';
      }
    });
    
    modeToggle.addEventListener('change', function() {
      const newMode = this.checked ? 'automatic' : 'manual';
      
      if (newMode === 'automatic') {
        modeDescription.innerHTML = '<strong>Automatic Mode:</strong> The extension will automatically detect and analyze code blocks on the page.';
      } else {
        modeDescription.innerHTML = '<strong>Manual Mode:</strong> Right-click on selected code and choose "Analyze Code" to detect issues.';
      }
      
        chrome.runtime.sendMessage({
        action: 'setMode',
        mode: newMode
      });
    });
  });
  
  document.getElementById('options-link').addEventListener('click', function() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });
});

function updateAiStatus(enabled, hasApiKey) {
  const aiStatusText = document.getElementById('ai-status-text');
  
  if (enabled && hasApiKey) {
    aiStatusText.textContent = 'Enabled';
    aiStatusText.style.color = '#5cb85c';
  } else if (enabled && !hasApiKey) {
    aiStatusText.textContent = 'Missing API Key';
    aiStatusText.style.color = '#f0ad4e';
  } else {
    aiStatusText.textContent = 'Disabled';
    aiStatusText.style.color = '#6c757d';
  }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "updatePopup") {
    chrome.storage.local.set({
      lastAnalysis: request.analysis,
      lastCode: request.code
    });
    
    displayAnalysisResults(request.analysis, request.code);
  }
});

function displayAnalysisResults(analysis, code) {
  document.getElementById('no-analysis').style.display = 'none';
  
  document.getElementById('analysis-results').style.display = 'block';
  
  const classLabel = document.getElementById('classification-label');
  classLabel.textContent = analysis.classification;
  
  classLabel.className = 'classification';
  if (analysis.classification === 'Malicious') {
    classLabel.classList.add('malicious');
  } else if (analysis.classification === 'Vulnerable') {
    classLabel.classList.add('vulnerable');
  } else if (analysis.classification === 'Code Smells') {
    classLabel.classList.add('code-smells');
  } else {
    classLabel.classList.add('works-fine');
  }
  
  if (analysis.aiClassification) {
    classLabel.textContent += ` (AI: ${analysis.aiClassification})`;
  }
  
  const issuesList = document.getElementById('issues-list');
  issuesList.innerHTML = '';
  
  if (analysis.details && analysis.details.length > 0) {
    document.getElementById('issues-title').style.display = 'block';
    
    analysis.details.forEach(function(detail) {
      const li = document.createElement('li');
      
      const severitySpan = document.createElement('span');
 
      severitySpan.classList.add('severity-' + detail.severity);
      severitySpan.textContent = detail.type;
      
      li.appendChild(severitySpan);
      li.innerHTML += ': ' + detail.message;
      
      issuesList.appendChild(li);
    });
  } else {
    document.getElementById('issues-title').style.display = 'none';
  }
  
  document.getElementById('code-preview').textContent = code;
}