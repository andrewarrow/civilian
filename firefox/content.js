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
  } else if (hostname === 'www.youtube.com') {
    console.log('[Newsance] Detected YouTube');
    return 'youtube';
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

async function extractJiraIssues() {
  console.log('[Newsance Jira] Starting Jira issue extraction...');
  
  // Get immediately visible issues first
  let issues = extractCurrentlyVisibleIssues();
  console.log(`[Newsance Jira] Found ${issues.length} immediately visible issues`);
  
  // If we have a decent number, return them quickly
  if (issues.length >= 8) {
    console.log('[Newsance Jira] Returning immediately visible issues for speed');
    return issues;
  }
  
  // Otherwise, try a quick scroll to load more
  console.log('[Newsance Jira] Attempting quick scroll to find more issues...');
  const allDiscoveredIssues = new Map();
  
  // Add current issues to the map
  issues.forEach(issue => {
    allDiscoveredIssues.set(issue.key, issue);
  });
  
  // Try a few quick scroll attempts
  await quickScrollToLoadMore(allDiscoveredIssues);
  
  const finalIssues = Array.from(allDiscoveredIssues.values());
  console.log(`[Newsance Jira] Final extraction complete. Found ${finalIssues.length} unique issues`);
  return finalIssues;
}

function extractCurrentlyVisibleIssues() {
  const issues = [];
  const cardElements = document.querySelectorAll('[id^="card-BIP-"]');
  
  cardElements.forEach(card => {
    const issueData = extractSingleCard(card);
    if (issueData.key) {
      issues.push(issueData);
    }
  });
  
  return issues;
}

function extractSingleCard(card) {
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
  
  return issueData;
}

async function quickScrollToLoadMore(allDiscoveredIssues) {
  console.log('[Newsance Jira] Quick scroll to load more issues...');
  
  // Only try 5 quick attempts
  for (let attempt = 0; attempt < 5; attempt++) {
    const beforeCount = allDiscoveredIssues.size;
    
    // Simple scrolling - just try to scroll each virtual list down
    const virtualLists = document.querySelectorAll('[data-testid="software-board.board-container.board.virtual-board.fast-virtual-list.fast-virtual-list-wrapper"]');
    virtualLists.forEach(list => {
      list.scrollBy(0, 300); // Small scroll
    });
    
    // Wait briefly for content to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check for new issues
    const cardElements = document.querySelectorAll('[id^="card-BIP-"]');
    cardElements.forEach(card => {
      const cardId = card.id;
      const issueKey = cardId.replace('card-', '');
      
      if (!allDiscoveredIssues.has(issueKey)) {
        const issueData = extractSingleCard(card);
        if (issueData.key) {
          allDiscoveredIssues.set(issueKey, issueData);
        }
      }
    });
    
    const afterCount = allDiscoveredIssues.size;
    const newFound = afterCount - beforeCount;
    
    console.log(`[Newsance Jira] Quick attempt ${attempt + 1}: Found ${newFound} new issues, total: ${afterCount}`);
    
    // If no new issues found in this attempt, stop early
    if (newFound === 0 && attempt > 1) {
      console.log('[Newsance Jira] No new issues found, stopping quick scroll');
      break;
    }
  }
}

function extractYouTubeVideos() {
  console.log('[Newsance YouTube] Starting YouTube video extraction...');
  const videos = [];
  
  // Primary method: Look for both ytd-rich-item-renderer and ytd-rich-grid-media containers
  const videoContainerSelectors = [
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'ytd-video-renderer',
    '[class*="video-renderer"]'
  ];
  
  let allVideoElements = [];
  videoContainerSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`[Newsance YouTube] Found ${elements.length} elements for selector: ${selector}`);
    allVideoElements.push(...Array.from(elements));
  });
  
  // Remove duplicates
  allVideoElements = [...new Set(allVideoElements)];
  console.log(`[Newsance YouTube] Total unique video elements: ${allVideoElements.length}`);
  
  allVideoElements.forEach((element, index) => {
    try {
      const videoData = extractSingleYouTubeVideo(element, index);
      if (videoData.title && videoData.url) {
        videos.push(videoData);
        console.log(`[Newsance YouTube] Extracted: ${videoData.title.substring(0, 50)}... (Channel: ${videoData.channel || 'N/A'})`);
      }
    } catch (error) {
      console.warn('[Newsance YouTube] Error extracting video data:', error);
    }
  });
  
  // If we didn't find many videos, try a broader search for all video links
  if (videos.length < 10) {
    console.log('[Newsance YouTube] Low video count, trying broader search...');
    
    const allVideoLinks = document.querySelectorAll('a[href*="/watch?v="]');
    console.log(`[Newsance YouTube] Found ${allVideoLinks.length} video links on page`);
    
    const seenUrls = new Set(videos.map(v => v.url));
    
    allVideoLinks.forEach((link, index) => {
      if (seenUrls.has(link.href) || videos.length >= 100) return;
      
      // Get title from various sources
      let title = link.textContent?.trim() || 
                 link.getAttribute('title') || 
                 link.getAttribute('aria-label');
      
      // Clean up the title
      if (title) {
        // Remove duration info from aria-label if present
        title = title.replace(/\s+\d+:\d+$/, '').replace(/\s+\d+ seconds?$/, '').trim();
        
        // Skip if it's not a real video title
        if (title.length < 3 || 
            title.includes('Subscribe') || 
            title.includes('Channel') ||
            title.includes('Go to channel') ||
            title.includes('Tap to')) {
          return;
        }
        
        // Try to find channel from parent element
        let channel = null;
        const parent = link.closest('ytd-rich-grid-media, ytd-rich-item-renderer, ytd-video-renderer');
        if (parent) {
          const channelElement = parent.querySelector('ytd-channel-name a, [id*="channel"] a, .channel-name a');
          if (channelElement) {
            channel = channelElement.textContent?.trim() || null;
          }
        }
        
        videos.push({
          title: title,
          url: link.href,
          videoId: link.href.includes('v=') ? link.href.split('v=')[1].split('&')[0] : null,
          channel: channel,
          views: null,
          duration: null
        });
        seenUrls.add(link.href);
        console.log(`[Newsance YouTube] Added via broad search: ${title.substring(0, 50)}...`);
      }
    });
  }
  
  console.log(`[Newsance YouTube] Final extraction complete. Found ${videos.length} unique videos`);
  return videos.slice(0, 100); // Increased limit to 100 videos
}

function extractSingleYouTubeVideo(element, index = 0) {
  const videoData = {
    title: null,
    videoId: null,
    channel: null,
    views: null,
    duration: null,
    publishedTime: null,
    url: null
  };
  
  // Extract video title - improved selectors based on HTML structure
  const titleSelectors = [
    'a#video-title-link',  // Primary selector from HTML
    '#video-title-link',
    'yt-formatted-string#video-title',  // Title text element
    'a#video-title',
    '#video-title',
    'h3 a[href*="/watch?v="]',
    '.title a[href*="/watch?v="]'
  ];
  
  let titleElement = null;
  let titleText = null;
  
  for (const selector of titleSelectors) {
    titleElement = element.querySelector(selector);
    if (titleElement) {
      // Try multiple ways to get title text
      titleText = titleElement.textContent?.trim() || 
                 titleElement.getAttribute('title')?.trim() ||
                 titleElement.getAttribute('aria-label')?.trim();
      
      if (titleText && titleText.length > 3) {
        // Clean up aria-label if it contains duration info
        titleText = titleText.replace(/\s+\d+:\d+$/, '').replace(/\s+\d+ seconds?$/, '').trim();
        videoData.title = titleText;
        break;
      }
    }
  }
  
  // If we still don't have title, try the formatted string directly
  if (!videoData.title) {
    const formattedTitle = element.querySelector('yt-formatted-string#video-title');
    if (formattedTitle) {
      videoData.title = formattedTitle.textContent?.trim();
    }
  }
  
  // Extract video URL and ID - prioritize the title link
  const linkSelectors = [
    'a#video-title-link',
    'a[href*="/watch?v="]'
  ];
  
  for (const selector of linkSelectors) {
    const linkElement = element.querySelector(selector);
    if (linkElement) {
      const href = linkElement.getAttribute('href');
      if (href && href.includes('/watch?v=')) {
        // Handle relative URLs
        videoData.url = href.startsWith('http') ? href : `https://www.youtube.com${href}`;
        
        // Extract video ID from URL
        const videoIdMatch = href.match(/[?&]v=([a-zA-Z0-9_-]+)/);
        if (videoIdMatch) {
          videoData.videoId = videoIdMatch[1];
        }
        break;
      }
    }
  }
  
  // Extract channel name - improved selectors
  const channelSelectors = [
    'ytd-channel-name a',  // Primary channel selector
    '#channel-name a',
    '.ytd-channel-name a',
    '[id*="channel-name"] a',
    '.channel-name a',
    'a[href*="/channel/"], a[href*="/@"]'
  ];
  
  for (const selector of channelSelectors) {
    const channelElement = element.querySelector(selector);
    if (channelElement) {
      const channelText = channelElement.textContent?.trim();
      if (channelText && channelText.length > 1 && !channelText.includes('Subscribe')) {
        videoData.channel = channelText;
        break;
      }
    }
  }
  
  // Extract view count - look for metadata
  const metadataElements = element.querySelectorAll('span, .metadata span, ytd-video-meta-block span');
  for (const span of metadataElements) {
    const text = span.textContent?.trim();
    if (text && (text.includes('views') || text.includes('view')) && 
        (text.includes('K') || text.includes('M') || text.includes('B') || /^\d+/.test(text))) {
      videoData.views = text;
      break;
    }
  }
  
  // Extract duration from thumbnail overlay
  const durationSelectors = [
    '.ytd-thumbnail-overlay-time-status-renderer',
    '[class*="duration"]',
    '.badge-style-type-simple[aria-label*=":"]',
    'span[aria-label*=":"]'
  ];
  
  for (const selector of durationSelectors) {
    const durationElement = element.querySelector(selector);
    if (durationElement) {
      const duration = durationElement.textContent?.trim() || durationElement.getAttribute('aria-label');
      if (duration && duration.match(/\d+:\d+/)) {
        videoData.duration = duration;
        break;
      }
    }
  }
  
  // Extract published time
  const timeSelectors = [
    '[class*="published"] span',
    '.metadata span[aria-label*="ago"]',
    'span[aria-label*="ago"]'
  ];
  
  for (const selector of timeSelectors) {
    const timeElement = element.querySelector(selector);
    if (timeElement) {
      const timeText = timeElement.textContent?.trim() || timeElement.getAttribute('aria-label');
      if (timeText && timeText.includes('ago')) {
        videoData.publishedTime = timeText;
        break;
      }
    }
  }
  
  return videoData;
}

function replaceYouTubeHomepage() {
  console.log('[Newsance YouTube] Replacing YouTube homepage with Craigslist-style layout...');
  
  // Wait longer for YouTube to fully load and render content
  setTimeout(() => {
    console.log('[Newsance YouTube] First attempt at video extraction...');
    const videos = extractYouTubeVideos();
    if (videos.length > 0) {
      injectCraigslistLayout(videos);
    } else {
      // Wait even longer for YouTube's lazy loading
      console.log('[Newsance YouTube] No videos found, waiting longer...');
      setTimeout(() => {
        console.log('[Newsance YouTube] Second attempt at video extraction...');
        const retryVideos = extractYouTubeVideos();
        if (retryVideos.length > 0) {
          injectCraigslistLayout(retryVideos);
        } else {
          // Final attempt with even more time
          console.log('[Newsance YouTube] Still no videos, final attempt...');
          setTimeout(() => {
            console.log('[Newsance YouTube] Final attempt at video extraction...');
            const finalVideos = extractYouTubeVideos();
            injectCraigslistLayout(finalVideos); // Inject regardless, even if empty
          }, 5000);
        }
      }, 5000);
    }
  }, 4000);
}

function injectCraigslistLayout(videos) {
  console.log(`[Newsance YouTube] Injecting Craigslist layout with ${videos.length} videos using Shadow DOM`);
  
  // Clear the body completely 
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin: 0; padding: 0; background: white;';
  
  // Create a container element
  const container = document.createElement('div');
  container.id = 'craigslist-container';
  document.body.appendChild(container);
  
  // Create Shadow DOM - this bypasses CSP completely!
  const shadowRoot = container.attachShadow({ mode: 'open' });
  
  // Create our styles (not subject to CSP in shadow DOM)
  const styles = `
    <style>
      * { box-sizing: border-box; }
      body, div { margin: 0; padding: 0; }
      .container {
        font-family: 'Times New Roman', serif;
        background-color: #ffffff;
        color: #000000;
        padding: 20px;
        line-height: 1.4;
        min-height: 100vh;
      }
      .header {
        border-bottom: 1px solid #ccc;
        margin-bottom: 20px;
        padding-bottom: 10px;
      }
      .title {
        font-size: 24px;
        font-weight: normal;
        margin: 0 0 10px 0;
        color: #000;
      }
      .subtitle {
        font-size: 12px;
        color: #666;
      }
      .video-item {
        margin-bottom: 15px;
        padding: 8px 0;
        border-bottom: 1px dotted #ccc;
      }
      .video-title {
        margin-bottom: 4px;
      }
      .video-link {
        color: #0000EE;
        text-decoration: underline;
        font-size: 14px;
        font-weight: normal;
      }
      .video-link:hover {
        color: #551A8B;
      }
      .video-meta {
        font-size: 11px;
        color: #666;
        margin-left: 20px;
      }
      .no-videos {
        padding: 20px;
        color: #666;
        font-style: italic;
      }
      .footer {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #ccc;
        font-size: 11px;
        color: #999;
        text-align: center;
      }
    </style>
  `;
  
  // Build the HTML content
  const videoListings = videos.length > 0 
    ? videos.map((video, index) => `
        <div class="video-item">
          <div class="video-title">
            <a href="${video.url || '#'}" class="video-link" target="_parent">
              ${video.title || `Video ${index + 1}`}
            </a>
          </div>
          ${video.channel || video.duration || video.views || video.publishedTime ? `
            <div class="video-meta">
              ${[
                video.channel ? `by ${video.channel}` : null,
                video.duration, 
                video.views,
                video.publishedTime
              ].filter(v => v).join(' • ')}
            </div>
          ` : ''}
        </div>
      `).join('')
    : '<div class="no-videos">No videos found. This might be because YouTube is still loading or using a different layout.</div>';
  
  const htmlContent = `
    ${styles}
    <div class="container">
      <div class="header">
        <h1 class="title">youtube videos</h1>
        <div class="subtitle">${videos.length > 0 ? `${videos.length} videos found` : 'no videos found - page may still be loading'}</div>
      </div>
      
      <div class="video-listings">
        ${videoListings}
      </div>
      
      <div class="footer">
        simplified youtube • powered by civilian extension
      </div>
    </div>
  `;
  
  // Inject into shadow DOM (bypasses all CSP restrictions!)
  shadowRoot.innerHTML = htmlContent;
  
  console.log('[Newsance YouTube] Shadow DOM Craigslist layout injected successfully');
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
      // Handle async function
      extractJiraIssues().then(data => {
        sendResponse({ issues: data });
      }).catch(error => {
        console.error('[Newsance Jira] Error extracting issues:', error);
        sendResponse({ issues: [] });
      });
    } else {
      sendResponse({ issues: [] });
    }
    return true;
  } else if (message.type === 'GET_YOUTUBE_VIDEOS') {
    const site = detectSite();
    if (site === 'youtube') {
      const data = extractYouTubeVideos();
      sendResponse({ videos: data });
    } else {
      sendResponse({ videos: [] });
    }
    return true;
  }
});

// Simple site detection on load
const site = detectSite();
if (site) {
  console.log(`[Newsance] Active on ${site}`);
  
  // If this is YouTube, replace the homepage with our custom layout
  if (site === 'youtube') {
    // Wait for the page to load, then replace content
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', replaceYouTubeHomepage);
    } else {
      replaceYouTubeHomepage();
    }
  }
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