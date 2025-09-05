console.log('[Newsance] Background script loaded');

// Rate limiting queue for user data requests
const userDataQueue = [];
const userDataCache = new Map();
// Random delay between 1-6 seconds
function getRandomDelay() {
  return Math.floor(Math.random() * 5000) + 1000; // 1000-6000ms
}
let isProcessingQueue = false;

// Load cached data from storage on startup
loadCachedData();

// Listen for messages from popup/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_USER_DATA') {
    fetchUserData(message.usernames);
    sendResponse({ status: 'started' });
    return true;
  }
});

async function fetchUserData(usernames) {
  for (const username of usernames) {
    // Check in-memory cache first
    if (userDataCache.has(username)) {
      // Send cached data immediately
      broadcastUserData(username, userDataCache.get(username));
      continue;
    }
    
    // Check persistent storage
    const stored = await getStoredUserData(username);
    if (stored) {
      // Load into memory cache and broadcast
      userDataCache.set(username, stored);
      broadcastUserData(username, stored);
      continue;
    }
    
    // Add to queue for processing
    userDataQueue.push(username);
  }
  
  // Start processing queue if not already running
  if (!isProcessingQueue) {
    processUserDataQueue();
  }
}

async function processUserDataQueue() {
  if (userDataQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }
  
  isProcessingQueue = true;
  const username = userDataQueue.shift();
  
  try {
    const userInfo = await fetchSingleUserData(username);
    userDataCache.set(username, userInfo);
    
    // Store in persistent storage
    await storeUserData(username, userInfo);
    
    // Broadcast update to all listeners (popup)
    broadcastUserData(username, userInfo);
    
  } catch (error) {
    console.error(`Failed to fetch data for ${username}:`, error);
    const errorInfo = { username, karma: 'Error', created: 'Error' };
    userDataCache.set(username, errorInfo);
    
    // Store error info in persistent storage too
    await storeUserData(username, errorInfo);
    
    broadcastUserData(username, errorInfo);
  }
  
  // Wait random time before processing next request
  const delay = getRandomDelay();
  console.log(`[Newsance] Waiting ${delay}ms before next request`);
  setTimeout(processUserDataQueue, delay);
}

function broadcastUserData(username, userInfo) {
  // Send message to all extension contexts (popup, content scripts, etc.)
  chrome.runtime.sendMessage({
    type: 'USER_DATA_UPDATE',
    username,
    userInfo
  }).catch(() => {
    // Ignore errors if popup is closed
  });
}

async function fetchSingleUserData(username) {
  const response = await fetch(`https://news.ycombinator.com/user?id=${username}`);
  const html = await response.text();
  
  // Parse the HTML to extract karma and created date
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  let karma = 'N/A';
  let created = 'N/A';
  
  // Find karma and created date from the table structure
  const rows = doc.querySelectorAll('tbody tr');
  
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 2) {
      const label = cells[0].textContent.trim();
      if (label === 'karma:') {
        karma = cells[1].textContent.trim();
      } else if (label === 'created:') {
        const link = cells[1].querySelector('a');
        if (link) {
          created = link.textContent.trim();
        }
      }
    }
  }
  
  return { username, karma, created };
}

// Storage functions for persistent caching
async function loadCachedData() {
  try {
    const result = await chrome.storage.local.get(['userDataCache']);
    if (result.userDataCache) {
      const cached = JSON.parse(result.userDataCache);
      for (const [username, data] of Object.entries(cached)) {
        userDataCache.set(username, data);
      }
      console.log(`[Newsance] Loaded ${userDataCache.size} cached users from storage`);
    }
  } catch (error) {
    console.error('[Newsance] Failed to load cached data:', error);
  }
}

async function storeUserData(username, userInfo) {
  try {
    userDataCache.set(username, userInfo);
    
    // Convert Map to object for storage
    const cacheObj = {};
    for (const [key, value] of userDataCache.entries()) {
      cacheObj[key] = value;
    }
    
    await chrome.storage.local.set({
      userDataCache: JSON.stringify(cacheObj)
    });
    
    console.log(`[Newsance] Stored data for ${username}`);
  } catch (error) {
    console.error(`[Newsance] Failed to store data for ${username}:`, error);
  }
}

async function getStoredUserData(username) {
  try {
    const result = await chrome.storage.local.get(['userDataCache']);
    if (result.userDataCache) {
      const cached = JSON.parse(result.userDataCache);
      return cached[username] || null;
    }
  } catch (error) {
    console.error(`[Newsance] Failed to get stored data for ${username}:`, error);
  }
  return null;
}