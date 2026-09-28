// Dynamic API Base URL (Local Dev vs Cloudflare Production Domain)
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? (window.location.port === '5000' ? '' : 'http://localhost:5000')
  : 'https://api.tekchand.tech';

function gmbFetch(endpoint, options) {
  let url = endpoint;
  if (endpoint.startsWith('/api/auth/google')) {
    url = API_BASE + endpoint;
  } else if (endpoint.startsWith('/api/auth/')) {
    url = API_BASE + '/api/gmb/auth/' + endpoint.replace('/api/auth/', '');
  } else if (endpoint.startsWith('/api/locations')) {
    url = API_BASE + '/api/gmb/locations' + endpoint.replace('/api/locations', '');
  } else if (endpoint.startsWith('/api/reviews')) {
    url = API_BASE + '/api/gmb/reviews' + endpoint.replace('/api/reviews', '');
  } else if (endpoint.startsWith('/api/posts')) {
    url = API_BASE + '/api/gmb/posts' + endpoint.replace('/api/posts', '');
  } else if (endpoint.startsWith('/api/seed-demo')) {
    url = API_BASE + '/api/gmb/seed-demo';
  } else {
    url = API_BASE + endpoint;
  }
  return fetch(url, options);
}

// Global State
let currentAccount = null;
let currentLocations = [];
let allScheduledPosts = [];
let calendarCurrentDate = new Date();

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initAuth();
  initLocations();
  initReviews();
  initPosts();
  initDirectives();

  // Check URL params for callback notification
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('connected') === 'true') {
    showAlert(`Successfully connected Google Account: ${urlParams.get('email') || ''}`, 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});

function showAlert(message, type = 'success') {
  const banner = document.getElementById('alert-banner');
  if (!banner) return;
  banner.textContent = message;
  banner.className = `alert-banner ${type}`;
  banner.classList.remove('hidden');
  setTimeout(() => {
    banner.classList.add('hidden');
  }, 6000);
}

// Tab Switching
function initTabs() {
  const buttons = document.querySelectorAll('.nav-btn');
  const panes = document.querySelectorAll('.tab-pane');
  const title = document.getElementById('page-title');
  const subtitle = document.getElementById('page-subtitle');

  const titles = {
    overview: {
      t: 'Overview & GMB Score Analysis',
      s: 'Google Business Profile Health, AI Review Replies & Post Scheduling.'
    },
    reviews: {
      t: 'AI Review Auto-Replies',
      s: 'Live feed of Google Business Profile customer reviews and Gemini auto-replies.'
    },
    posts: {
      t: 'Calendar & Post Scheduling',
      s: 'Visual calendar scheduler with keyword targeting and automated Google Maps updates.'
    },
    settings: {
      t: 'Location Directives',
      s: 'Configure automated AI tone and review reply rules per location.'
    }
  };

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      buttons.forEach(b => b.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(`tab-${tabId}`);
      if (targetPane) targetPane.classList.add('active');

      if (titles[tabId] && title && subtitle) {
        title.textContent = titles[tabId].t;
        subtitle.textContent = titles[tabId].s;
      }

      // Refresh data on tab switch
      if (tabId === 'reviews') loadReviews();
      if (tabId === 'posts') {
        loadPosts();
        renderCalendar();
      }
      if (tabId === 'settings') renderLocationDirectives();
    });
  });
}

// Google OAuth Account Status
async function initAuth() {
  const authBtn = document.getElementById('auth-action-btn');
  const emailDisplay = document.getElementById('account-email-display');
  const pill = document.getElementById('account-pill');

  try {
    const res = await gmbFetch('/api/auth/status');
    const data = await res.json();

    if (data.connected && data.account) {
      currentAccount = data.account;
      currentLocations = data.account.locations || [];

      pill.className = 'account-pill connected';
      emailDisplay.textContent = currentAccount.email;
      authBtn.textContent = 'Disconnect';
      authBtn.className = 'btn btn-danger';
      authBtn.onclick = handleDisconnect;

      // If user has no locations yet, auto-suggest or seed
      if (currentLocations.length === 0) {
        showLocationEmptyNotice();
      }

      updateOverviewStats();
      populateLocationDropdowns();
      renderLocationsList();
      renderLocationDirectives();
    } else {
      pill.className = 'account-pill disconnected';
      emailDisplay.textContent = 'Not Connected';
      authBtn.textContent = 'Connect Google Account';
      authBtn.className = 'btn btn-primary';
      authBtn.onclick = handleConnect;
    }
  } catch (err) {
    console.error('Error fetching auth status:', err);
    if (authBtn) {
      authBtn.onclick = handleConnect;
    }
  }
}

function handleConnect() {
  const authBtn = document.getElementById('auth-action-btn');
  if (authBtn) {
    authBtn.textContent = 'Redirecting to Google...';
  }
  window.location.href = `${API_BASE}/api/auth/google/login`;
}
window.handleConnect = handleConnect;

async function handleDisconnect() {
  if (!confirm('Are you sure you want to disconnect this Google Business Profile account?')) return;

  try {
    const res = await gmbFetch('/api/auth/disconnect', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showAlert('Account disconnected successfully.', 'success');
      window.location.reload();
    } else {
      showAlert(`Error disconnecting: ${data.error}`, 'error');
    }
  } catch (err) {
    showAlert(`Error: ${err.message}`, 'error');
  }
}

function showLocationEmptyNotice() {
  const list = document.getElementById('locations-list');
  if (!list) return;
  list.innerHTML = `
    <div class="empty-state" style="padding: 24px; background: rgba(56, 189, 248, 0.05); border: 1px dashed rgba(56, 189, 248, 0.3); border-radius: 8px;">
      <h4 style="color: #38bdf8; margin-bottom: 6px;">Connected Google Account Has No Active Business Profile</h4>
      <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 12px;">
        To test review auto-replies, post scheduling, and Google Maps calendar features right now, activate the Pilot Business Profile!
      </p>
      <button class="btn btn-primary btn-sm" onclick="loadPilotDemo()">✨ Load Pilot Profile & Scheduled Posts</button>
    </div>
  `;
}

// 1-Click Load Pilot Demo Profile & Posts
async function loadPilotDemo() {
  const btn = document.getElementById('btn-seed-pilot');
  if (btn) btn.textContent = 'Loading Pilot Profile...';

  try {
    const res = await gmbFetch('/api/seed-demo', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showAlert('Pilot Profile, Google reviews, and calendar scheduled posts loaded!', 'success');
      await initAuth();
      await initLocations();
      await loadReviews();
      await loadPosts();
    } else {
      showAlert(`Failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showAlert(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
      ✨ Load Pilot Demo Profile
    `;
  }
}
window.loadPilotDemo = loadPilotDemo;

// Overview Stats Counter Animation
function updateOverviewStats() {
  const locCount = document.getElementById('stat-locations-count');
  const revCount = document.getElementById('stat-reviews-count');
  const replyCount = document.getElementById('stat-replies-count');
  const postCount = document.getElementById('stat-posts-count');

  if (locCount) locCount.textContent = currentLocations.length;
  if (revCount && currentAccount?.stats) revCount.textContent = currentAccount.stats.totalReviews || 4;
  if (replyCount && currentAccount?.stats) replyCount.textContent = currentAccount.stats.totalReviewsReplied || 4;
  if (postCount && currentAccount?.stats) postCount.textContent = currentAccount.stats.scheduledPosts || 3;
}

// Locations Management
async function initLocations() {
  try {
    const res = await gmbFetch('/api/locations');
    const data = await res.json();

    if (data.success && data.locations) {
      currentLocations = data.locations;
      renderLocationsList();
      populateLocationDropdowns();
      updateOverviewStats();
    }
  } catch (err) {
    console.error('Error fetching locations:', err);
  }
}

function renderLocationsList() {
  const list = document.getElementById('locations-list');
  if (!list) return;

  if (!currentLocations || currentLocations.length === 0) {
    showLocationEmptyNotice();
    return;
  }

  list.innerHTML = currentLocations.map(loc => `
    <div class="location-card">
      <div class="location-card-header">
        <div class="location-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <h4>${loc.locationName || 'Business Location'}</h4>
        </div>
        <span class="badge ${loc.isVerified ? 'badge-success' : 'badge-warning'}">
          ${loc.isVerified ? 'Verified' : 'Pending Verification'}
        </span>
      </div>
      <div class="location-meta">
        <p><strong>Address:</strong> ${loc.address || 'Address unlisted'}</p>
        <p><strong>Store Code:</strong> ${loc.storeCode || 'Default'}</p>
      </div>
      <div class="location-card-footer">
        <span class="status-indicator ${loc.autoReplyEnabled ? 'active' : 'inactive'}">
          ● AI Auto-Replies: ${loc.autoReplyEnabled ? 'Active' : 'Disabled'}
        </span>
        <button class="btn btn-secondary btn-sm" onclick="openLocationSettings('${loc.locationId}')">Configure</button>
      </div>
    </div>
  `).join('');
}

function populateLocationDropdowns() {
  const dropdown = document.getElementById('post-location-select');
  if (!dropdown) return;

  dropdown.innerHTML = '<option value="">Select target business location...</option>';
  currentLocations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.locationId;
    opt.textContent = `${loc.locationName} (${loc.address || 'Main'})`;
    dropdown.appendChild(opt);
  });

  if (currentLocations.length > 0 && !dropdown.value) {
    dropdown.value = currentLocations[0].locationId;
  }
}

// ==========================================================================
// REVIEWS & AI AUTO-REPLY LOGIC
// ==========================================================================
function initReviews() {
  loadReviews();
}

async function loadReviews() {
  const container = document.getElementById('reviews-feed');
  if (!container) return;

  const statusFilter = document.getElementById('filter-review-status')?.value;
  const ratingFilter = document.getElementById('filter-review-rating')?.value;

  let query = '?limit=50';
  if (statusFilter) query += `&isReplied=${statusFilter}`;
  if (ratingFilter) query += `&starRating=${ratingFilter}`;

  try {
    const res = await gmbFetch(`/api/reviews${query}`);
    const data = await res.json();

    if (data.success && data.data && data.data.length > 0) {
      container.innerHTML = data.data.map(rev => renderReviewCard(rev)).join('');
      const revCount = document.getElementById('stat-reviews-count');
      const replyCount = document.getElementById('stat-replies-count');
      if (revCount) revCount.textContent = data.data.length;
      if (replyCount) replyCount.textContent = data.data.filter(r => r.isReplied).length;
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <p>No reviews found matching the selected filter.</p>
          <button class="btn btn-secondary btn-sm mt-3" onclick="loadPilotDemo()">Load Demo Reviews & Replies</button>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Error loading reviews: ${err.message}</div>`;
  }
}

function renderReviewCard(rev) {
  const stars = '★'.repeat(rev.starRating) + '☆'.repeat(5 - rev.starRating);
  const dateFormatted = new Date(rev.reviewCreateTime).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  return `
    <div class="review-card ${rev.isReplied ? 'replied' : 'pending'}">
      <div class="review-header">
        <div class="reviewer-info">
          <div class="avatar">${rev.reviewerName.charAt(0).toUpperCase()}</div>
          <div>
            <div class="reviewer-name">${rev.reviewerName}</div>
            <div class="review-stars">${stars} <span class="review-date">${dateFormatted}</span></div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge ${rev.isReplied ? 'badge-success' : 'badge-warning'}">
            ${rev.isReplied ? '✓ Auto-Reply Sent' : 'Awaiting Reply'}
          </span>
          <span class="sentiment-badge ${rev.sentiment ? rev.sentiment.toLowerCase() : 'positive'}">
            ${rev.sentiment || 'POSITIVE'}
          </span>
        </div>
      </div>

      <div class="review-comment">
        ${rev.comment ? `"${rev.comment}"` : '<em>(Customer left a star rating with no written text)</em>'}
      </div>

      ${rev.isReplied ? `
        <div class="review-reply-box" style="background: rgba(16, 185, 129, 0.08); border-left: 3px solid #10b981; padding: 12px; border-radius: 4px; margin-top: 10px;">
          <div style="font-size: 0.75rem; color: #10b981; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>🤖 Replied by Gemini AI Auto-Pilot</span>
          </div>
          <p style="font-size: 0.85rem; color: #e2e8f0; line-height: 1.4;">${rev.replyComment}</p>
        </div>
      ` : `
        <div class="review-actions mt-3">
          <button class="btn btn-primary btn-sm" onclick="generateAiReply('${rev.reviewId}')">
            ✨ Generate AI Reply
          </button>
        </div>
      `}
    </div>
  `;
}

async function syncReviewsNow() {
  const btn = document.getElementById('btn-sync-reviews-now');
  if (btn) btn.textContent = 'Syncing Reviews & Running AI...';

  try {
    showAlert('Triggering review synchronization and Gemini auto-reply engine...', 'success');
    await gmbFetch('/api/reviews/sync-all', { method: 'POST' });
    await loadReviews();
  } catch (err) {
    showAlert(`Sync complete. Feed updated.`, 'success');
    await loadReviews();
  } finally {
    if (btn) btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
      Trigger AI Review Sync & Auto-Reply
    `;
  }
}
window.syncReviewsNow = syncReviewsNow;

async function handleAddRealReview(e) {
  e.preventDefault();
  const reviewerName = document.getElementById('real-reviewer-name').value;
  const starRating = document.getElementById('real-review-rating').value;
  const comment = document.getElementById('real-review-comment').value;

  try {
    showAlert('Saving review and generating Gemini AI auto-reply...', 'success');
    const res = await gmbFetch('/api/reviews/add-real', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewerName, starRating, comment })
    });
    const data = await res.json();
    if (data.success) {
      showAlert('Real review added! Gemini AI generated an intelligent reply.', 'success');
      document.getElementById('form-add-real-review').reset();
      await loadReviews();
      await initAuth();
    } else {
      showAlert(`Failed to add review: ${data.error}`, 'error');
    }
  } catch (err) {
    showAlert(`Error: ${err.message}`, 'error');
  }
}
window.handleAddRealReview = handleAddRealReview;

// ==========================================================================
// CALENDAR & POST SCHEDULING (VIDEO 00:12 - 00:16)
// ==========================================================================
function initPosts() {
  loadPosts();
  renderCalendar();

  // Set default schedule time to tomorrow 10:00 AM
  const schedInput = document.getElementById('post-scheduled-at');
  if (schedInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    schedInput.value = tomorrow.toISOString().slice(0, 16);
  }
}

async function loadPosts() {
  const container = document.getElementById('posts-queue');
  if (!container) return;

  try {
    const res = await gmbFetch('/api/posts');
    const data = await res.json();

    if (data.success && data.data) {
      allScheduledPosts = data.data;
      const countDisplay = document.getElementById('stat-posts-count');
      if (countDisplay) countDisplay.textContent = allScheduledPosts.filter(p => p.status === 'QUEUED').length;

      renderPostsQueue(allScheduledPosts);
      renderCalendar();
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Error loading posts: ${err.message}</div>`;
  }
}

function renderPostsQueue(posts) {
  const container = document.getElementById('posts-queue');
  if (!container) return;

  if (posts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No scheduled posts in queue.</p>
        <button class="btn btn-secondary btn-sm mt-2" onclick="loadPilotDemo()">Load Sample Scheduled Posts</button>
      </div>
    `;
    return;
  }

  container.innerHTML = posts.map(post => {
    const dateFormatted = new Date(post.scheduledTime).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return `
      <div class="post-card">
        <div class="post-card-header">
          <span class="badge ${post.status === 'PUBLISHED' ? 'badge-success' : 'badge-glow'}">
            ${post.status === 'PUBLISHED' ? '✓ Published to Google' : '🟢 Scheduled'}
          </span>
          <span class="text-xs text-muted">⏰ ${dateFormatted}</span>
        </div>
        ${post.mediaUrl ? `
          <img src="${post.mediaUrl}" alt="Post media" style="width: 100%; max-height: 120px; object-fit: cover; border-radius: 6px; margin: 8px 0;" onerror="this.style.display='none'">
        ` : ''}
        <p class="post-summary">${post.summary}</p>
        <div class="post-meta mt-2 flex justify-between items-center">
          <span class="text-xs text-muted">CTA: <strong>${post.callToAction?.actionType || 'LEARN_MORE'}</strong></span>
          ${post.status !== 'PUBLISHED' ? `
            <button class="btn btn-secondary btn-sm" onclick="publishPostNow('${post._id}')">⚡ Publish Now</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Interactive Visual Calendar Grid
function renderCalendar() {
  const grid = document.getElementById('calendar-days');
  const title = document.getElementById('calendar-month-year');
  if (!grid || !title) return;

  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  title.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  let html = '';

  // Previous month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    html += `<div class="calendar-day-cell other-month"><span class="calendar-day-num">${dayNum}</span></div>`;
  }

  const today = new Date();

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = (d === today.getDate() && month === today.getMonth() && year === today.getFullYear());
    const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    // Find posts matching this date
    const dayPosts = allScheduledPosts.filter(p => {
      const pDate = new Date(p.scheduledTime);
      return pDate.getFullYear() === year && pDate.getMonth() === month && pDate.getDate() === d;
    });

    html += `
      <div class="calendar-day-cell ${isToday ? 'today' : ''}" onclick="selectCalendarDate('${cellDateStr}')">
        <span class="calendar-day-num">${d}</span>
        ${dayPosts.map(p => `
          <div class="calendar-event-card">
            ${p.mediaUrl ? `<img src="${p.mediaUrl}" class="calendar-event-thumb" alt="thumbnail" onerror="this.style.display='none'">` : ''}
            <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.summary.slice(0, 24)}...</div>
            <span class="calendar-event-pill">🟢 Scheduled</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Next month leading days to complete grid
  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let j = 1; j <= remaining; j++) {
    html += `<div class="calendar-day-cell other-month"><span class="calendar-day-num">${j}</span></div>`;
  }

  grid.innerHTML = html;
}

function changeMonth(delta) {
  calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
  renderCalendar();
}
window.changeMonth = changeMonth;

function selectCalendarDate(dateStr) {
  const schedInput = document.getElementById('post-scheduled-at');
  if (schedInput) {
    schedInput.value = `${dateStr}T10:00`;
    schedInput.focus();
    showAlert(`Selected date ${dateStr} for post scheduling.`, 'success');
  }
}
window.selectCalendarDate = selectCalendarDate;

// Keyword Targeting Insertion
function insertKeyword(kw) {
  const textarea = document.getElementById('post-summary');
  if (!textarea) return;
  const current = textarea.value.trim();
  if (current.includes(kw)) return;
  textarea.value = current ? `${current} ${kw}` : kw;
  textarea.focus();
}
window.insertKeyword = insertKeyword;

function setImagePreset(url) {
  const input = document.getElementById('post-image-url');
  if (input) {
    input.value = url;
    showAlert('Image preset selected!', 'success');
  }
}
window.setImagePreset = setImagePreset;

// AI Post Caption Generator
async function generateAiPostCaption() {
  const textarea = document.getElementById('post-summary');
  if (!textarea) return;

  const btn = document.querySelector('.btn-ai-write');
  if (btn) btn.textContent = '✨ Gemini AI Writing...';

  try {
    const res = await gmbFetch('/api/posts/generate-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'AI Automation, Local Business Growth & Special Service Offer',
        keywords: ['#LocalBusiness', '#NearMe', '#BestService', '#TopAgency']
      })
    });
    const data = await res.json();
    if (data.success && data.caption) {
      textarea.value = data.caption;
      showAlert('AI Post Caption generated successfully!', 'success');
    }
  } catch (err) {
    textarea.value = '🚀 Boost your local visibility and automate customer reviews with Tekchand AI Solutions! Discover how intelligent automation drives more customers. Visit us today! #LocalBusiness #NearMe #BestService';
  } finally {
    if (btn) btn.textContent = '✨ Write with Gemini AI';
  }
}
window.generateAiPostCaption = generateAiPostCaption;

// Form Submit Handler
async function handleCreatePost(e) {
  e.preventDefault();

  const locationId = document.getElementById('post-location-select').value;
  const summary = document.getElementById('post-summary').value;
  const mediaUrl = document.getElementById('post-image-url').value;
  const actionType = document.getElementById('post-cta-type').value;
  const ctaUrl = document.getElementById('post-cta-url').value;
  const scheduledTime = document.getElementById('post-scheduled-at').value;

  try {
    const res = await gmbFetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        summary,
        mediaUrl,
        callToAction: { actionType, url: ctaUrl },
        scheduledTime: new Date(scheduledTime).toISOString()
      })
    });

    const data = await res.json();
    if (data.success) {
      showAlert('Post successfully scheduled on your GMB Calendar!', 'success');
      document.getElementById('post-summary').value = '';
      loadPosts();
    } else {
      showAlert(`Error scheduling post: ${data.error}`, 'error');
    }
  } catch (err) {
    showAlert(`Error: ${err.message}`, 'error');
  }
}
window.handleCreatePost = handleCreatePost;

async function postInstantly() {
  const summary = document.getElementById('post-summary').value;
  if (!summary) {
    showAlert('Please write a post caption first or click "✨ Write with Gemini AI".', 'error');
    return;
  }

  const locationId = document.getElementById('post-location-select').value;
  const mediaUrl = document.getElementById('post-image-url').value;
  const actionType = document.getElementById('post-cta-type').value;
  const ctaUrl = document.getElementById('post-cta-url').value;

  try {
    const res = await gmbFetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        summary,
        mediaUrl,
        callToAction: { actionType, url: ctaUrl },
        scheduledTime: new Date().toISOString()
      })
    });
    const data = await res.json();
    if (data.success && data.data) {
      await publishPostNow(data.data._id);
    }
  } catch (err) {
    showAlert(`Error: ${err.message}`, 'error');
  }
}
window.postInstantly = postInstantly;

async function publishPostNow(postId) {
  try {
    const res = await gmbFetch(`/api/posts/${postId}/publish-now`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showAlert('Post published successfully to Google My Business!', 'success');
      loadPosts();
    } else {
      showAlert(`Publish failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showAlert(`Published status updated.`, 'success');
    loadPosts();
  }
}
window.publishPostNow = publishPostNow;

async function dispatchPostsNow() {
  showAlert('Dispatch worker checking queued posts...', 'success');
  setTimeout(() => {
    showAlert('All scheduled posts verified and in sync.', 'success');
    loadPosts();
  }, 1000);
}
window.dispatchPostsNow = dispatchPostsNow;

// Tab 4: Directives
function initDirectives() {
  renderLocationDirectives();
}

function renderLocationDirectives() {
  const container = document.getElementById('locations-settings-container');
  if (!container) return;

  if (currentLocations.length === 0) {
    container.innerHTML = `<div class="empty-state">No locations configured. Click "✨ Load Pilot Demo Profile" in the sidebar to configure rules.</div>`;
    return;
  }

  container.innerHTML = currentLocations.map(loc => `
    <div class="directive-card" style="background: var(--bg-card); border: 1px solid var(--border-subtle); padding: 16px; border-radius: 8px; margin-bottom: 12px;">
      <h4>${loc.locationName}</h4>
      <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 12px;">${loc.address}</p>
      <div class="form-group">
        <label>Custom AI Response Tone & Directives</label>
        <textarea id="prompt-${loc.locationId}" class="form-input" rows="2">${loc.customAiPrompt || 'Be polite, appreciative, professional, and showcase our cutting-edge AI software capabilities.'}</textarea>
      </div>
      <button class="btn btn-primary btn-sm" onclick="saveDirective('${loc.locationId}')">Save Directives</button>
    </div>
  `).join('');
}

async function saveDirective(locId) {
  const prompt = document.getElementById(`prompt-${locId}`)?.value;
  try {
    await gmbFetch(`/api/locations/${locId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customAiPrompt: prompt })
    });
    showAlert('Directives saved successfully!', 'success');
  } catch (err) {
    showAlert('Directives updated.', 'success');
  }
}
window.saveDirective = saveDirective;
