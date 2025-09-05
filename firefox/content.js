console.log('[Newsance] Content script loaded on:', window.location.href);

function detectSite() {
  const hostname = window.location.hostname;
  
  if (hostname === 'news.ycombinator.com') {
    console.log('[Newsance] Detected Hacker News');
    return 'hackernews';
  } else if (hostname.includes('reddit.com')) {
    console.log('[Newsance] Detected Reddit');
    return 'reddit';
  } else if (hostname.includes('atlassian.net')) {
    console.log('[Newsance] Detected Jira');
    return 'jira';
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

function extractJiraIssues() {
  console.log('[Newsance Jira] Starting Jira issue extraction...');
  const issues = [];
  
  // Find all issue cards by their unique ID pattern
  const cardElements = document.querySelectorAll('[id^="card-BIP-"]');
  
  console.log(`[Newsance Jira] Found ${cardElements.length} BIP issue cards`);
  
  cardElements.forEach(card => {
    // Extract issue key from card ID
    const cardId = card.id;
    const issueKey = cardId.replace('card-', '');
    
    const issueData = {
      key: issueKey,
      title: null,
      type: null,
      assignee: null,
      column: null
    };
    
    // Method 1: Extract title from aria-label of focus container button
    const focusContainer = card.querySelector('[data-testid="platform-card.ui.card.focus-container"]');
    if (focusContainer) {
      const ariaLabel = focusContainer.getAttribute('aria-label');
      if (ariaLabel) {
        // Parse aria-label format: "BIP-253 [aroma,toi] Create subscribeHandler. Use the enter key to load the work item."
        const titleMatch = ariaLabel.match(/^BIP-\d+\s+(.+)\.\s+Use the enter key/);
        if (titleMatch) {
          issueData.title = titleMatch[1];
        }
      }
    }
    
    // Method 2: Extract title from static summary span (alternative method)
    if (!issueData.title) {
      const summarySpan = card.querySelector('[data-component-selector="issue-field-summary-inline-edit.ui.read.static-summary"]');
      if (summarySpan) {
        issueData.title = summarySpan.textContent.trim();
      }
    }
    
    // Extract issue type from image alt attribute
    const typeImg = card.querySelector('img[alt][class*="_1bsb7vkz"]');
    if (typeImg) {
      issueData.type = typeImg.getAttribute('alt');
    }
    
    // Extract assignee from hidden span
    const assigneeSpan = card.querySelector('span[id][hidden]');
    if (assigneeSpan) {
      let assigneeText = assigneeSpan.textContent.trim();
      // Clean up "Assignee: " prefix if present
      if (assigneeText.startsWith('Assignee: ')) {
        assigneeText = assigneeText.substring(10);
      }
      issueData.assignee = assigneeText;
    }
    
    // Find column by traversing up to find the nearest column header
    let element = card;
    while (element && !issueData.column) {
      element = element.parentElement;
      
      // Look for column title within this element
      const columnTitle = element?.querySelector('[data-testid="platform-board-kit.common.ui.column-header.editable-title.column-title.column-name"]');
      if (columnTitle) {
        issueData.column = columnTitle.textContent.trim();
        break;
      }
    }
    
    // If column not found via traversal, try a different approach
    if (!issueData.column) {
      // Get all column headers on the page
      const columnHeaders = document.querySelectorAll('[data-testid="platform-board-kit.common.ui.column-header.editable-title.column-title.column-name"]');
      const cardRect = card.getBoundingClientRect();
      
      // Find the column header that's closest horizontally to this card
      let closestColumn = null;
      let closestDistance = Infinity;
      
      columnHeaders.forEach(header => {
        const headerRect = header.getBoundingClientRect();
        const distance = Math.abs(cardRect.left - headerRect.left);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestColumn = header;
        }
      });
      
      if (closestColumn) {
        issueData.column = closestColumn.textContent.trim();
      }
    }
    
    issues.push(issueData);
  });
  
  console.log(`[Newsance Jira] Extracted ${issues.length} issues:`, issues);
  return issues;
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
  } else if (message.type === 'GET_JIRA_ISSUES') {
    const site = detectSite();
    if (site === 'jira') {
      const data = extractJiraIssues();
      sendResponse({ issues: data });
    } else {
      sendResponse({ issues: [] });
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