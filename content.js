let lastSelectedCode = "";
let currentMode = "manual";
let codeBlocksDetected = [];
let autoAnalysisInterval = null;

chrome.storage.local.get(['mode'], function(data) {
  if (data.mode) {
    currentMode = data.mode;
    initializeMode(currentMode);
  }
});

document.addEventListener('mouseup', function() {
  if (currentMode === "manual") {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText && selectedText.length > 0) {
      lastSelectedCode = selectedText;
    }
  }
});

function initializeMode(mode) {
  currentMode = mode;
  
  if (autoAnalysisInterval) {
    clearInterval(autoAnalysisInterval);
    autoAnalysisInterval = null;
  }
  
  removeExistingNotification();
  removeCodeHighlights();
  
  if (mode === "automatic") {
    detectCodeBlocks();
    autoAnalysisInterval = setInterval(detectCodeBlocks, 1800000); 
  }
}

function detectCodeBlocks() {
  const potentialCodeElements = [
    ...document.querySelectorAll('pre'),
    ...document.querySelectorAll('code'),
    ...document.querySelectorAll('.code'),
    ...document.querySelectorAll('.highlight'),
    ...document.querySelectorAll('.CodeMirror'),
    ...document.querySelectorAll('[class*="code"]'),
    ...document.querySelectorAll('[class*="syntax"]')
  ];
  
  removeCodeHighlights();
  codeBlocksDetected = [];
  
  potentialCodeElements.forEach((element, index) => {
    if (element.offsetWidth < 100 || element.offsetHeight < 30) return;
    
    const rect = element.getBoundingClientRect();
    if (rect.top < 0 || rect.left < 0 || 
        rect.bottom > (window.innerHeight || document.documentElement.clientHeight) || 
        rect.right > (window.innerWidth || document.documentElement.clientWidth)) {
      return;
    }
    
    const code = element.textContent.trim();
 
    if (code.length < 20) return;

    const codeIndicators = /[{};()=><\[\]]/;
    if (!codeIndicators.test(code)) return;
    
    codeBlocksDetected.push({
      element: element,
      code: code,
      id: `code-block-${index}`,
      position: {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height
      }
    });
    
    highlightCodeBlock(element, index);
    
    chrome.runtime.sendMessage({
      action: "analyzeSelectedCode",
      code: code,
      mode: "automatic",
      codePosition: {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
        id: `code-block-${index}`
      }
    });
  });
}

function highlightCodeBlock(element, index) {
  const overlay = document.createElement('div');
  overlay.id = `code-block-overlay-${index}`;
  overlay.className = 'code-analyzer-overlay';
  
  const rect = element.getBoundingClientRect();
  overlay.style.position = 'absolute';
  overlay.style.top = `${rect.top + window.scrollY}px`;
  overlay.style.left = `${rect.left + window.scrollX}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.border = '2px dashed #5bc0de';
  overlay.style.borderRadius = '5px';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '9998';
  
  const label = document.createElement('div');
  label.className = 'code-analyzer-label';
  label.id = `code-block-label-${index}`;
  label.textContent = 'Analyzing...';
  label.style.position = 'absolute';
  label.style.top = `${rect.top + window.scrollY - 20}px`;
  label.style.left = `${rect.left + window.scrollX}px`;
  label.style.backgroundColor = '#5bc0de';
  label.style.color = 'white';
  label.style.padding = '2px 5px';
  label.style.borderRadius = '3px';
  label.style.fontSize = '10px';
  label.style.zIndex = '9998';
  
  document.body.appendChild(overlay);
  document.body.appendChild(label);
}

function removeCodeHighlights() {
  document.querySelectorAll('.code-analyzer-overlay, .code-analyzer-label').forEach(el => {
    el.remove();
  });
}

function updateCodeBlockLabel(blockId, analysis) {
  const label = document.getElementById(`code-block-label-${blockId.replace('code-block-', '')}`);
  if (label) {
    label.textContent = `${analysis.classification}`;
    
    switch (analysis.classification) {
      case 'Malicious':
        label.style.backgroundColor = '#d9534f';
        break;
      case 'Vulnerable':
        label.style.backgroundColor = '#f0ad4e';
        break;
      case 'Code Smells':
        label.style.backgroundColor = '#5bc0de';
        break;
      case 'Works Fine':
        label.style.backgroundColor = '#5cb85c';
        break;
    }
    
    label.style.cursor = 'pointer';
    label.style.pointerEvents = 'auto';
    
    label.setAttribute('data-analysis', JSON.stringify(analysis));
    
    label.addEventListener('click', function(e) {
      e.stopPropagation();
      const analysisData = JSON.parse(this.getAttribute('data-analysis'));
      showDetailedAnalysis(analysisData, blockId);
    });
  }
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {  
  if (request.action === "getSelectedCode") {
    const selectedCode = lastSelectedCode || window.getSelection().toString().trim();    
    if (selectedCode && selectedCode.length > 0) {
      chrome.runtime.sendMessage({
        action: "analyzeSelectedCode",
        code: selectedCode,
        mode: "manual"
      });
    }
  }
  
  if (request.action === "displayAnalysisResult") {
    if (request.mode === "automatic" && request.codePosition) {
      updateCodeBlockLabel(request.codePosition.id, request.analysis);
    } else {
      showAnalysisResult(request.analysis);
    }
  }
  
  if (request.action === "modeChanged") {
    initializeMode(request.mode);
  }
});

function showDetailedAnalysis(analysis, blockId) {
  removeExistingNotification();
  
  const notification = document.createElement('div');
  notification.id = 'code-analyzer-notification';
  notification.className = 'code-analyzer-notification';

  const label = document.getElementById(`code-block-label-${blockId.replace('code-block-', '')}`);
  const labelRect = label.getBoundingClientRect();
  
  notification.style.position = 'absolute';
  notification.style.top = `${labelRect.bottom + window.scrollY + 5}px`;
  notification.style.left = `${labelRect.left + window.scrollX}px`;
  notification.style.width = '300px';
  notification.style.padding = '15px';
  notification.style.backgroundColor = getBackgroundColor(analysis.classification);
  notification.style.color = '#fff';
  notification.style.borderRadius = '5px';
  notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
  notification.style.zIndex = '9999';
  notification.style.fontSize = '14px';
  
  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '10px';
  title.style.fontSize = '16px';
  title.textContent = `Classification: ${analysis.classification}`;
  notification.appendChild(title);
  
  if (analysis.details.length > 0) {
    const detailsList = document.createElement('ul');
    detailsList.style.margin = '10px 0';
    detailsList.style.paddingLeft = '20px';
    
    const displayDetails = analysis.details.slice(0, 5);
    
    displayDetails.forEach(detail => {
      const item = document.createElement('li');
      item.style.marginBottom = '5px';
      item.innerHTML = `<strong>${detail.type}</strong> (${detail.severity}): ${detail.message}`;
      detailsList.appendChild(item);
    });
    
    if (analysis.details.length > 5) {
      const moreItem = document.createElement('li');
      moreItem.textContent = `And ${analysis.details.length - 5} more issues...`;
      detailsList.appendChild(moreItem);
    }
    
    notification.appendChild(detailsList);
  } else {
    const message = document.createElement('p');
    message.textContent = 'No issues detected in the code.';
    notification.appendChild(message);
  }
  
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.backgroundColor = '#ffffff';
  closeButton.style.color = '#333';
  closeButton.style.border = 'none';
  closeButton.style.padding = '5px 10px';
  closeButton.style.borderRadius = '3px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.float = 'right';
  closeButton.onclick = removeExistingNotification;
  notification.appendChild(closeButton);
  
  document.body.appendChild(notification);
  
  setTimeout(removeExistingNotification, 10000);
}

function showAnalysisResult(analysis) {
  removeExistingNotification();
  
  const notification = document.createElement('div');
  notification.id = 'code-analyzer-notification';
  notification.className = 'code-analyzer-notification';
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.width = '300px';
  notification.style.padding = '15px';
  notification.style.backgroundColor = getBackgroundColor(analysis.classification);
  notification.style.color = '#fff';
  notification.style.borderRadius = '5px';
  notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
  notification.style.zIndex = '9999';
  notification.style.fontSize = '14px';
  
  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '10px';
  title.style.fontSize = '16px';
  title.textContent = `Classification: ${analysis.classification}`;
  notification.appendChild(title);
  
  if (analysis.details.length > 0) {
    const detailsList = document.createElement('ul');
    detailsList.style.margin = '10px 0';
    detailsList.style.paddingLeft = '20px';
    
    const displayDetails = analysis.details.slice(0, 5);
    
    displayDetails.forEach(detail => {
      const item = document.createElement('li');
      item.style.marginBottom = '5px';
      item.innerHTML = `<strong>${detail.type}</strong> (${detail.severity}): ${detail.message}`;
      detailsList.appendChild(item);
    });
    
    if (analysis.details.length > 5) {
      const moreItem = document.createElement('li');
      moreItem.textContent = `And ${analysis.details.length - 5} more issues...`;
      detailsList.appendChild(moreItem);
    }
    
    notification.appendChild(detailsList);
  } else {
    const message = document.createElement('p');
    message.textContent = 'No issues detected in the code.';
    notification.appendChild(message);
  }
  
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.backgroundColor = '#ffffff';
  closeButton.style.color = '#333';
  closeButton.style.border = 'none';
  closeButton.style.padding = '5px 10px';
  closeButton.style.borderRadius = '3px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.float = 'right';
  closeButton.onclick = removeExistingNotification;
  notification.appendChild(closeButton);
  
  document.body.appendChild(notification);

  setTimeout(removeExistingNotification, 10000);
}

function removeExistingNotification() {
  const existingNotification = document.getElementById('code-analyzer-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
}

function getBackgroundColor(classification) {
  switch (classification) {
    case 'Malicious':
      return '#d9534f'; // Red
    case 'Vulnerable':
      return '#f0ad4e'; // Orange
    case 'Code Smells':
      return '#5bc0de'; // Blue
    case 'Works Fine':
      return '#5cb85c'; // Green
    default:
      return '#5cb85c'; // Green
  }
}