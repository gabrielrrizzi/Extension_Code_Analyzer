document.addEventListener('DOMContentLoaded', function() {
    // Load saved settings
    chrome.storage.local.get(['enableAi', 'openaiApiKey'], function(data) {
      // Set the initial state of the toggle
      document.getElementById('enable-ai').checked = !!data.enableAi;
      
      // Set the API key if available
      if (data.openaiApiKey) {
        document.getElementById('openai-api-key').value = data.openaiApiKey;
      }
    });
    
    // Save settings button
    document.getElementById('save-settings').addEventListener('click', function() {
      const enableAi = document.getElementById('enable-ai').checked;
      const openaiApiKey = document.getElementById('openai-api-key').value.trim();
      
      // Show warning if AI is enabled but no API key
      if (enableAi && !openaiApiKey) {
        if (!confirm('You have enabled AI analysis but no API key is provided. AI analysis will not work without an API key. Continue anyway?')) {
          return;
        }
      }
      
      // Save settings
      chrome.storage.local.set({
        enableAi: enableAi,
        openaiApiKey: openaiApiKey
      }, function() {
        // Show success message
        const successMessage = document.getElementById('save-success');
        successMessage.style.display = 'block';
        
        // Hide success message after 3 seconds
        setTimeout(function() {
          successMessage.style.display = 'none';
        }, 3000);
      });
    });
    
    // Toggle API key visibility
    document.getElementById('toggle-api-key').addEventListener('click', function() {
      const apiKeyInput = document.getElementById('openai-api-key');
      const toggleButton = document.getElementById('toggle-api-key');
      
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleButton.textContent = 'Hide';
      } else {
        apiKeyInput.type = 'password';
        toggleButton.textContent = 'Show';
      }
    });
  });