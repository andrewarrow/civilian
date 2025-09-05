let userDataMap = new Map(); // Store user data as it comes in

document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0].url;
    const siteDisplay = document.getElementById('siteDisplay');
    const usernamesContainer = document.getElementById('usernames-container');
    
    if (url.includes('news.ycombinator.com')) {
      const siteSpan = siteDisplay.querySelector('span');
      siteSpan.textContent = 'Hacker News';
      
      // Send message to content script to get usernames
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_USERNAMES' }, (response) => {
        if (response && response.usernames && response.usernames.length > 0) {
          displayUsernames(response.usernames);
          // Start fetching user data in background
          fetchUserData(response.usernames);
        } else {
          usernamesContainer.innerHTML = '<div class="no-data">No usernames found</div>';
        }
      });
    } else if (url.includes('reddit.com')) {
      const siteSpan = siteDisplay.querySelector('span');
      const randomWordBtn = document.getElementById('randomWordBtn');
      
      siteSpan.textContent = 'Reddit';
      randomWordBtn.style.display = 'inline-block';
      
      // Set up random word button
      randomWordBtn.addEventListener('click', handleRandomWordClick);
      
      // Send message to content script to get usernames
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_USERNAMES' }, (response) => {
        if (response && response.usernames && response.usernames.length > 0) {
          displayUsernames(response.usernames);
          // For Reddit, we show subreddit instead of karma/created for now
          displayRedditTable();
        } else {
          usernamesContainer.innerHTML = '<div class="no-data">No usernames found on this Reddit page</div>';
        }
      });
    } else if (url.includes('youtube.com')) {
      const siteSpan = siteDisplay.querySelector('span');
      const randomWordBtn = document.getElementById('randomWordBtn');
      
      siteSpan.textContent = 'YouTube';
      randomWordBtn.style.display = 'inline-block';
      
      // Set up random word button for YouTube
      randomWordBtn.addEventListener('click', handleYouTubeRandomWordClick);
      
      usernamesContainer.innerHTML = '<div class="no-data">Random word search for YouTube videos</div>';
    } else {
      const siteSpan = siteDisplay.querySelector('span');
      siteSpan.textContent = 'n/a';
      usernamesContainer.innerHTML = '<div class="no-data">Visit Hacker News, Reddit, or YouTube to see usernames</div>';
    }
  });
});

function fetchUserData(data) {
  const usernames = data.map(item => typeof item === 'string' ? item : item.username);
  
  // Initialize user data map with basic info
  data.forEach(item => {
    const username = typeof item === 'string' ? item : item.username;
    const site = typeof item === 'string' ? 'N/A' : item.site;
    userDataMap.set(username, {
      username,
      site,
      karma: 'Loading...',
      created: 'Loading...'
    });
  });
  
  // Listen for updates from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'USER_DATA_UPDATE') {
      const userData = userDataMap.get(message.username);
      if (userData) {
        userData.karma = message.userInfo.karma;
        userData.created = message.userInfo.created;
        updateTable();
      }
    } else if (message.type === 'NEW_USERNAMES_DETECTED') {
      // Handle new usernames detected from infinite scroll
      console.log(`[Newsance Popup] Received ${message.usernames.length} new usernames:`, message.usernames.map(u => u.username));
      addNewUsernames(message.usernames);
    }
  });
  
  // Request user data from background script
  chrome.runtime.sendMessage({
    type: 'FETCH_USER_DATA',
    usernames: usernames
  });
  
  // Update table with loading state
  updateTable();
}

function displayUsernames(data) {
  data.forEach(item => {
    const username = typeof item === 'string' ? item : item.username;
    const site = typeof item === 'string' ? 'N/A' : item.site;
    userDataMap.set(username, {
      username,
      site,
      karma: 'N/A',
      created: 'N/A'
    });
  });
  
  updateTable();
}

function updateTable() {
  const usernamesContainer = document.getElementById('usernames-container');
  
  let tableHtml = '<table class="usernames-table">';
  tableHtml += '<thead><tr><th>Username</th><th>Site</th><th>Karma</th><th>Created</th></tr></thead><tbody>';
  
  userDataMap.forEach(userData => {
    tableHtml += `<tr>
      <td>${userData.username}</td>
      <td>${userData.site}</td>
      <td>${userData.karma}</td>
      <td>${userData.created}</td>
    </tr>`;
  });
  
  tableHtml += '</tbody></table>';
  usernamesContainer.innerHTML = tableHtml;
}

function displayRedditTable() {
  const usernamesContainer = document.getElementById('usernames-container');
  
  let tableHtml = '<table class="usernames-table">';
  tableHtml += '<thead><tr><th>Username</th><th>Subreddit</th></tr></thead><tbody>';
  
  userDataMap.forEach(userData => {
    tableHtml += `<tr>
      <td>${userData.username}</td>
      <td>${userData.site}</td>
    </tr>`;
  });
  
  tableHtml += '</tbody></table>';
  usernamesContainer.innerHTML = tableHtml;
}

function addNewUsernames(newUsernamesData) {
  // Get current tab URL to determine site type
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0].url;
    let isHackerNews = url && url.includes('news.ycombinator.com');
    
    newUsernamesData.forEach(item => {
      const username = typeof item === 'string' ? item : item.username;
      const site = typeof item === 'string' ? 'N/A' : item.site;
      
      // Skip if we already have this username
      if (userDataMap.has(username)) {
        return;
      }
      
      // Add to our data map
      if (isHackerNews) {
        // For Hacker News, initialize with loading state for karma/created
        userDataMap.set(username, {
          username,
          site,
          karma: 'Loading...',
          created: 'Loading...'
        });
        
        // Request user data for new username
        chrome.runtime.sendMessage({
          type: 'FETCH_USER_DATA',
          usernames: [username]
        });
      } else {
        // For Reddit, just show username and subreddit
        userDataMap.set(username, {
          username,
          site
        });
      }
    });
    
    // Update the table to show new usernames
    if (isHackerNews) {
      updateTable();
    } else {
      displayRedditTable();
    }
    
    console.log(`[Newsance Popup] Added ${newUsernamesData.length} new usernames. Total: ${userDataMap.size}`);
  });
}

async function handleRandomWordClick() {
  const randomWordBtn = document.getElementById('randomWordBtn');
  
  try {
    // Disable button and show loading state
    randomWordBtn.disabled = true;
    randomWordBtn.textContent = 'Loading...';
    
    console.log('[Newsance] Fetching random word...');
    
    // Fetch random word from API
    const response = await fetch('https://random-word-api.herokuapp.com/word');
    const data = await response.json();
    const randomWord = data[0];
    
    console.log('[Newsance] Got random word:', randomWord);
    
    // Clear current usernames since we're going to a new search
    userDataMap.clear();
    
    // Navigate to new Reddit search URL
    const searchUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(randomWord)}&type=comments&sort=new&cId=42e061d2-a478-41ca-986b-4695d778cbf3&iId=415de118-88be-44d3-81c5-1ff7766fd79e`;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      console.log('[Newsance] Current tab:', tabs[0]);
      console.log('[Newsance] Navigating to:', searchUrl);
      
      chrome.tabs.update(tabs[0].id, { url: searchUrl }, (updatedTab) => {
        console.log('[Newsance] Tab updated:', updatedTab);
        
        if (chrome.runtime.lastError) {
          console.error('[Newsance] Error updating tab:', chrome.runtime.lastError);
          
          // Re-enable button on error
          randomWordBtn.disabled = false;
          randomWordBtn.textContent = 'Permission Error';
          
          setTimeout(() => {
            randomWordBtn.textContent = 'Random Word';
          }, 3000);
        } else {
          // Close the popup after successful navigation
          window.close();
        }
      });
    });
    
  } catch (error) {
    console.error('[Newsance] Error fetching random word:', error);
    
    // Re-enable button and show error state
    randomWordBtn.disabled = false;
    randomWordBtn.textContent = 'Error - Try Again';
    
    // Reset button text after 3 seconds
    setTimeout(() => {
      randomWordBtn.textContent = 'Random Word';
    }, 3000);
  }
}

async function handleYouTubeRandomWordClick() {
  const randomWordBtn = document.getElementById('randomWordBtn');
  
  try {
    // Disable button and show loading state
    randomWordBtn.disabled = true;
    randomWordBtn.textContent = 'Loading...';
    
    console.log('[Newsance] Fetching random word for YouTube...');
    
    // Fetch random word from API
    const response = await fetch('https://random-word-api.herokuapp.com/word');
    const data = await response.json();
    const randomWord = data[0];
    
    console.log('[Newsance] Got random word:', randomWord);
    
    // Navigate to YouTube search URL with the specified parameters
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(randomWord)}&sp=EgYIAhABGAI%253D`;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      console.log('[Newsance] Current tab:', tabs[0]);
      console.log('[Newsance] Navigating to YouTube search:', searchUrl);
      
      chrome.tabs.update(tabs[0].id, { url: searchUrl }, (updatedTab) => {
        console.log('[Newsance] Tab updated:', updatedTab);
        
        if (chrome.runtime.lastError) {
          console.error('[Newsance] Error updating tab:', chrome.runtime.lastError);
          
          // Re-enable button on error
          randomWordBtn.disabled = false;
          randomWordBtn.textContent = 'Permission Error';
          
          setTimeout(() => {
            randomWordBtn.textContent = 'Random Word';
          }, 3000);
        } else {
          // Close the popup after successful navigation
          window.close();
        }
      });
    });
    
  } catch (error) {
    console.error('[Newsance] Error fetching random word for YouTube:', error);
    
    // Re-enable button and show error state
    randomWordBtn.disabled = false;
    randomWordBtn.textContent = 'Error - Try Again';
    
    // Reset button text after 3 seconds
    setTimeout(() => {
      randomWordBtn.textContent = 'Random Word';
    }, 3000);
  }
}
