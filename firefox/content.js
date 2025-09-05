console.log('[Newsance] Content script loaded on:', window.location.href);

function detectSite() {
  const hostname = window.location.hostname;
  
  if (hostname === 'news.ycombinator.com') {
    console.log('[Newsance] Detected Hacker News');
    return 'hackernews';
  } else if (hostname.includes('reddit.com')) {
    console.log('[Newsance] Detected Reddit');
    return 'reddit';
  }
  
  return null;
}

function extractHackerNewsUsernames() {
  const data = [];
  
  // Find all submission rows
  const submissions = document.querySelectorAll('tr.athing');
  
  submissions.forEach(submission => {
    // Find the next sibling tr that contains the subtext with username
    const subtextRow = submission.nextElementSibling;
    if (!subtextRow) return;
    
    const userLink = subtextRow.querySelector('a.hnuser');
    if (!userLink) return;
    
    const username = userLink.textContent.trim();
    
    // Find the site information in the current submission row
    const titleLine = submission.querySelector('.titleline');
    let site = '';
    
    if (titleLine) {
      const siteStr = titleLine.querySelector('.sitestr');
      if (siteStr) {
        site = siteStr.textContent.trim();
      }
    }
    
    if (username) {
      data.push({
        username: username,
        site: site || 'N/A'
      });
    }
  });
  
  return data;
}

function extractRedditUsernames() {
  const data = [];
  const seenUsernames = new Set();
  
  console.log('[Newsance Reddit] Starting username extraction...');
  
  // Method 1: Find direct user links with href="/user/username/" pattern
  const userLinks = document.querySelectorAll('a[href^="/user/"]');
  console.log(`[Newsance Reddit] Method 1: Found ${userLinks.length} user links`);
  
  userLinks.forEach((link, index) => {
    const href = link.getAttribute('href');
    const match = href.match(/^\/user\/([^\/]+)\//);
    const textContent = link.textContent.trim();
    
    console.log(`[Newsance Reddit] Method 1 Link ${index}: href="${href}", text="${textContent}"`);
    
    if (match && match[1] && !seenUsernames.has(match[1])) {
      const username = match[1];
      seenUsernames.add(username);
      
      let subreddit = findSubredditContext(link);
      console.log(`[Newsance Reddit] Method 1 Added: ${username} from ${subreddit}`);
      
      data.push({
        username: username,
        site: subreddit
      });
    }
  });
  
  // Method 1b: Find username links by CSS class (more reliable for new Reddit)
  const usernameLinks = document.querySelectorAll('a.text-neutral-content-strong');
  console.log(`[Newsance Reddit] Method 1b: Found ${usernameLinks.length} potential username links`);
  
  usernameLinks.forEach((link, index) => {
    const textContent = link.textContent.trim();
    const href = link.getAttribute('href');
    
    console.log(`[Newsance Reddit] Method 1b Link ${index}: text="${textContent}", href="${href}"`);
    
    // Check if it looks like a username (3+ chars, valid characters, not starting with r/)
    if (textContent && 
        /^[a-zA-Z0-9_-]{3,}$/.test(textContent) && 
        !textContent.startsWith('r/') && 
        !seenUsernames.has(textContent)) {
      
      seenUsernames.add(textContent);
      let subreddit = findSubredditContext(link);
      console.log(`[Newsance Reddit] Method 1b Added: ${textContent} from ${subreddit}`);
      
      data.push({
        username: textContent,
        site: subreddit
      });
    }
  });
  
  // Method 2: Skip the complex time-based parsing for now - focus on the reliable CSS class method
  console.log(`[Newsance Reddit] Method 2: Skipped (using CSS class method instead)`);
  
  // Method 3: Skip the aggressive element scanning - focus on the reliable CSS class method  
  console.log(`[Newsance Reddit] Method 3: Skipped (using CSS class method instead)`);
  console.log(`[Newsance Reddit] Extraction complete. Found ${data.length} unique usernames:`, data.map(d => d.username));
  return data;
}

function findSubredditContext(element) {
  // Look for parent elements that might contain subreddit info
  let parent = element.closest('[data-testid*="search"], .search-result, article, .comment, [class*="search"], [class*="comment"], [class*="post"]');
  if (parent) {
    const subredditLink = parent.querySelector('a[href^="/r/"]');
    if (subredditLink) {
      const subredditMatch = subredditLink.getAttribute('href').match(/^\/r\/([^\/]+)/);
      if (subredditMatch && subredditMatch[1]) {
        return 'r/' + subredditMatch[1];
      }
    }
  }
  return 'N/A';
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_USERNAMES') {
    const site = detectSite();
    if (site === 'hackernews') {
      const data = extractHackerNewsUsernames();
      sendResponse({ usernames: data });
    } else if (site === 'reddit') {
      const data = extractRedditUsernames();
      sendResponse({ usernames: data });
    } else {
      sendResponse({ usernames: [] });
    }
    return true;
  }
});

// Simple site detection on load
const site = detectSite();
if (site) {
  console.log(`[Newsance] Active on ${site}`);
}

// Track current usernames to detect new ones
let currentUsernames = new Set();
let debounceTimeout = null;

// Function to send new usernames to popup
function sendNewUsernames(newUsernames) {
  if (newUsernames.length > 0) {
    console.log(`[Newsance] Sending ${newUsernames.length} new usernames to popup:`, newUsernames.map(u => u.username));
    
    // Send to popup via runtime message
    chrome.runtime.sendMessage({
      type: 'NEW_USERNAMES_DETECTED',
      usernames: newUsernames
    }).catch(() => {
      // Ignore errors if popup is closed
    });
  }
}

// Function to check for new usernames (debounced)
function checkForNewUsernames() {
  const site = detectSite();
  if (site !== 'reddit') return;
  
  const allUsernames = extractRedditUsernames();
  const newUsernames = [];
  
  allUsernames.forEach(userData => {
    if (!currentUsernames.has(userData.username)) {
      currentUsernames.add(userData.username);
      newUsernames.push(userData);
    }
  });
  
  if (newUsernames.length > 0) {
    sendNewUsernames(newUsernames);
  }
}

// Debounced version to prevent excessive parsing
function debouncedCheck() {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }
  debounceTimeout = setTimeout(checkForNewUsernames, 1000); // Wait 1 second after changes stop
}

// Monitor for URL changes (for single-page apps like Reddit)
let lastUrl = window.location.href;
const observer = new MutationObserver((mutations) => {
  // Check for URL changes
  if (lastUrl !== window.location.href) {
    lastUrl = window.location.href;
    const newSite = detectSite();
    if (newSite) {
      console.log(`[Newsance] URL changed, still active on ${newSite}`);
      // Reset username tracking on URL change
      currentUsernames.clear();
    }
  }
  
  // Check for new content being added (infinite scroll)
  const hasNewContent = mutations.some(mutation => 
    mutation.type === 'childList' && 
    mutation.addedNodes.length > 0 &&
    Array.from(mutation.addedNodes).some(node => 
      node.nodeType === Node.ELEMENT_NODE && 
      (node.querySelector && (node.querySelector('a[class*="text-neutral-content-strong"]') || 
                             node.querySelector('a[href^="/user/"]')))
    )
  );
  
  if (hasNewContent) {
    console.log('[Newsance] New content detected, checking for new usernames...');
    debouncedCheck();
  }
});

observer.observe(document, { subtree: true, childList: true });

// Also listen for scroll events to catch infinite scroll loading
let scrollTimeout = null;
window.addEventListener('scroll', () => {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  scrollTimeout = setTimeout(() => {
    if (detectSite() === 'reddit') {
      console.log('[Newsance] Scroll detected, checking for new content...');
      debouncedCheck();
    }
  }, 500);
});

// Initialize current usernames on load
if (detectSite() === 'reddit') {
  setTimeout(() => {
    const initialUsernames = extractRedditUsernames();
    initialUsernames.forEach(userData => {
      currentUsernames.add(userData.username);
    });
    console.log(`[Newsance] Initialized with ${currentUsernames.size} usernames`);
  }, 1000);
}