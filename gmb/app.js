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
  } else {
    url = API_BASE + endpoint;
  }
  return fetch(url, options);
}

// GMB Automation Microservice Dashboard Logic

let currentAccount = null;
let currentLocations = [];

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
      t: 'Overview & Account Status',
      s: 'Manage Google OAuth connection and view automated activities.'
    },
    reviews: {
      t: 'AI Review Auto-Replies',
      s: 'Live feed of Google Business Profile customer reviews and Gemini auto-replies.'
    },
    posts: {
      t: 'Scheduled Posts',
      s: 'Create and dispatch automated Google Business Profile updates & offers.'
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
      document.getElementById(`tab-${tabId}`).classList.add('active');

      if (titles[tabId]) {
        title.textContent = titles[tabId].t;
        subtitle.textContent = titles[tabId].s;
      }

      // Refresh data on tab switch
      if (tabId === 'reviews') loadReviews();
      if (tabId === 'posts') loadPosts();
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
  }
}

async function handleConnect() {
  try {
    const res = await gmbFetch('/api/auth/google/url');
    const data = await res.json();
    if (data.success && data.url) {
      window.location.href = data.url;
    } else {
      showAlert('Could not generate Google OAuth URL. Please check server credentials.', 'error');
    }
  } catch (err) {
    showAlert(`Error connecting: ${err.message}`, 'error');
  }
}

async function handleDisconnect() {
  if (!confirm('Are you sure you want to disconnect this Google Business Profile account?')) return;

  try {
    const res = await gmbFetch('/api/auth/disconnect', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showAlert('Account disconnected.', 'success');
      setTimeout(() => location.reload(), 1000);
    }
  } catch (err) {
    showAlert(`Disconnect failed: ${err.message}`, 'error');
  }
}

// Locations Handling
function initLocations() {
  document.getElementById('btn-sync-locations').addEventListener('click', async () => {
    try {
      const res = await gmbFetch('/api/locations/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showAlert(data.message, 'success');
        initAuth();
      } else {
        showAlert(data.error || 'Failed to sync locations', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });
}

function renderLocationsList() {
  const container = document.getElementById('locations-list');
  if (!currentLocations || currentLocations.length === 0) {
    container.innerHTML = '<div class="empty-state">No locations discovered under this Google Account.</div>';
    return;
  }

  container.innerHTML = currentLocations.map(loc => `
    <div class="location-item">
      <div class="location-item-header">
        <div class="location-title">${escapeHtml(loc.locationName)}</div>
        <span class="tag ${loc.autoReplyEnabled ? 'tag-success' : 'tag-neutral'}">
          ${loc.autoReplyEnabled ? 'Auto-Reply ON' : 'Auto-Reply OFF'}
        </span>
      </div>
      <div class="location-address">${escapeHtml(loc.address || 'Address not listed')}</div>
      <div style="font-size: 0.8rem; color: var(--text-muted);">
        ID: <code>${escapeHtml(loc.locationId)}</code>
      </div>
    </div>
  `).join('');
}

function populateLocationDropdowns() {
  const select = document.getElementById('post-location-select');
  select.innerHTML = '<option value="">Select a location...</option>' + 
    currentLocations.map(loc => `
      <option value="${loc.locationId}">${escapeHtml(loc.locationName)} (${loc.locationId})</option>
    `).join('');
}

// Reviews & AI Replies
function initReviews() {
  document.getElementById('btn-sync-reviews-now').addEventListener('click', async () => {
    try {
      showAlert('Initiating live review check & Gemini auto-replies in background...', 'success');
      const res = await gmbFetch('/api/reviews/sync-now', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTimeout(loadReviews, 3000);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('filter-review-status').addEventListener('change', loadReviews);
  document.getElementById('filter-review-rating').addEventListener('change', loadReviews);
}

async function loadReviews() {
  const feed = document.getElementById('reviews-feed');
  const isReplied = document.getElementById('filter-review-status').value;
  const rating = document.getElementById('filter-review-rating').value;

  let query = '?limit=50';
  if (isReplied !== '') query += `&isReplied=${isReplied}`;
  if (rating !== '') query += `&starRating=${rating}`;

  try {
    const res = await gmbFetch(`/api/reviews${query}`);
    const data = await res.json();

    if (!data.success || !data.data || data.data.length === 0) {
      feed.innerHTML = '<div class="empty-state">No reviews found matching the selected filter.</div>';
      return;
    }

    feed.innerHTML = data.data.map(review => {
      const stars = '★'.repeat(review.starRating) + '☆'.repeat(5 - review.starRating);
      const sentimentBadge = review.sentiment ? `
        <span class="tag ${review.sentiment === 'POSITIVE' ? 'tag-success' : review.sentiment === 'NEGATIVE' ? 'tag-warning' : 'tag-neutral'}">
          ${review.sentiment}
        </span>
      ` : '';

      return `
        <div class="review-card" id="rev-${review._id}">
          <div class="review-header">
            <div class="reviewer-info">
              <div class="reviewer-avatar">${review.reviewerName ? review.reviewerName.charAt(0).toUpperCase() : 'C'}</div>
              <div>
                <strong>${escapeHtml(review.reviewerName)}</strong>
                <div class="stars">${stars}</div>
              </div>
            </div>
            <div>
              ${sentimentBadge}
              <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">
                ${new Date(review.reviewCreateTime).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div class="review-comment">
            ${review.comment ? escapeHtml(review.comment) : '<em>No written comment provided.</em>'}
          </div>

          ${review.isReplied ? `
            <div class="reply-box">
              <div class="reply-box-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>
                Replied by ${review.repliedBy || 'System'} (${new Date(review.replyUpdateTime || Date.now()).toLocaleDateString()})
              </div>
              <div class="reply-box-text">${escapeHtml(review.replyComment)}</div>
            </div>
          ` : `
            <div style="margin-top: 12px; display: flex; gap: 8px;">
              <input type="text" class="form-input" id="reply-input-${review._id}" placeholder="Type manual reply or click Auto-Generate..." value="${escapeHtml(review.aiGeneratedReply || '')}">
              <button class="btn btn-secondary btn-sm" onclick="generateAiDraft('${review._id}')">AI Draft</button>
              <button class="btn btn-primary btn-sm" onclick="postManualReply('${review._id}')">Send Reply</button>
            </div>
          `}
        </div>
      `;
    }).join('');
  } catch (err) {
    feed.innerHTML = `<div class="empty-state">Error loading reviews: ${err.message}</div>`;
  }
}

window.generateAiDraft = async function(reviewId) {
  try {
    const input = document.getElementById(`reply-input-${reviewId}`);
    input.value = 'Generating with Gemini AI...';
    const res = await gmbFetch(`/api/reviews/${reviewId}/generate-ai-reply`, { method: 'POST' });
    const data = await res.json();
    if (data.success && data.data?.reply) {
      input.value = data.data.reply;
    } else {
      input.value = '';
      showAlert('Failed to generate AI draft.', 'error');
    }
  } catch (err) {
    showAlert(err.message, 'error');
  }
};

window.postManualReply = async function(reviewId) {
  try {
    const input = document.getElementById(`reply-input-${reviewId}`);
    const comment = input.value.trim();
    if (!comment) return showAlert('Please enter a reply comment first.', 'error');

    const res = await gmbFetch(`/api/reviews/${reviewId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment })
    });

    const data = await res.json();
    if (data.success) {
      showAlert('Reply published to Google Maps!', 'success');
      loadReviews();
    } else {
      showAlert(data.error || 'Failed to post reply.', 'error');
    }
  } catch (err) {
    showAlert(err.message, 'error');
  }
};

// Posts Management
function initPosts() {
  // Set default datetime picker to +1 hour
  const dateInput = document.getElementById('post-scheduled-at');
  const now = new Date(Date.now() + 60 * 60 * 1000);
  dateInput.value = now.toISOString().slice(0, 16);

  document.getElementById('form-create-post').addEventListener('submit', async (e) => {
    e.preventDefault();

    const locationId = document.getElementById('post-location-select').value;
    const summary = document.getElementById('post-summary').value;
    const imageUrl = document.getElementById('post-image-url').value;
    const ctaType = document.getElementById('post-cta-type').value;
    const ctaUrl = document.getElementById('post-cta-url').value;
    const scheduledAt = document.getElementById('post-scheduled-at').value;

    const payload = {
      locationId,
      summary,
      callToAction: { actionType: ctaType, url: ctaUrl },
      media: imageUrl ? [{ mediaFormat: 'PHOTO', sourceUrl: imageUrl }] : [],
      scheduledAt: new Date(scheduledAt).toISOString()
    };

    try {
      const res = await gmbFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        showAlert('Post scheduled successfully!', 'success');
        document.getElementById('form-create-post').reset();
        dateInput.value = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
        loadPosts();
      } else {
        showAlert(data.message || 'Failed to schedule post.', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('btn-dispatch-posts-now').addEventListener('click', async () => {
    try {
      const res = await gmbFetch('/api/posts/dispatch-now', { method: 'POST' });
      const data = await res.json();
      showAlert('Dispatch cycle started in background.', 'success');
      setTimeout(loadPosts, 2000);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });
}

async function loadPosts() {
  const container = document.getElementById('posts-queue');
  try {
    const res = await gmbFetch('/api/posts?limit=30');
    const data = await res.json();

    if (!data.success || !data.data || data.data.length === 0) {
      container.innerHTML = '<div class="empty-state">No scheduled or published posts. Create one using the form on the left.</div>';
      return;
    }

    container.innerHTML = data.data.map(p => {
      const statusClass = p.status === 'PUBLISHED' ? 'tag-success' : p.status === 'FAILED' ? 'tag-warning' : 'tag-neutral';
      return `
        <div class="post-card">
          <div class="post-card-header">
            <span class="tag ${statusClass}">${p.status}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">
              ${p.status === 'PUBLISHED' ? 'Published: ' + new Date(p.publishedAt).toLocaleString() : 'Scheduled: ' + new Date(p.scheduledAt).toLocaleString()}
            </span>
          </div>
          <div class="post-summary">${escapeHtml(p.summary)}</div>
          ${p.errorMessage ? `<div style="color: var(--accent-danger); font-size: 0.8rem; margin-bottom: 8px;">Error: ${escapeHtml(p.errorMessage)}</div>` : ''}
          <div class="post-meta">
            <span>Location: <code>${escapeHtml(p.locationId)}</code></span>
            ${p.status === 'SCHEDULED' ? `
              <button class="btn btn-secondary btn-sm" onclick="publishPostNow('${p._id}')">Publish Now</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Error loading posts: ${err.message}</div>`;
  }
}

window.publishPostNow = async function(postId) {
  try {
    const res = await gmbFetch(`/api/posts/${postId}/publish-now`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showAlert('Post published to GMB immediately!', 'success');
      loadPosts();
    } else {
      showAlert(data.error || 'Publish failed.', 'error');
    }
  } catch (err) {
    showAlert(err.message, 'error');
  }
};

// Location Directives (Tone & Settings)
function renderLocationDirectives() {
  const container = document.getElementById('locations-settings-container');
  if (!currentLocations || currentLocations.length === 0) {
    container.innerHTML = '<div class="empty-state">Connect an account to view and configure location rules.</div>';
    return;
  }

  container.innerHTML = currentLocations.map(loc => `
    <div class="card mt-3" style="background: var(--bg-surface);">
      <div class="card-header">
        <h4>${escapeHtml(loc.locationName)}</h4>
        <span style="font-size: 0.8rem; color: var(--text-muted);">ID: ${escapeHtml(loc.locationId)}</span>
      </div>
      <div class="card-body">
        <form onsubmit="saveLocationSettings(event, '${loc.locationId}')">
          <div class="form-row">
            <div class="form-group">
              <label>Auto-Reply Enabled</label>
              <select id="setting-autoreply-${loc.locationId}" class="form-input">
                <option value="true" ${loc.autoReplyEnabled ? 'selected' : ''}>Enabled (Autonomous AI)</option>
                <option value="false" ${!loc.autoReplyEnabled ? 'selected' : ''}>Disabled (Manual approval only)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Minimum Star Rating to Auto-Reply</label>
              <select id="setting-minrating-${loc.locationId}" class="form-input">
                <option value="1" ${loc.autoReplyMinimumRating === 1 ? 'selected' : ''}>1 Star (All Reviews)</option>
                <option value="3" ${loc.autoReplyMinimumRating === 3 ? 'selected' : ''}>3 Stars & Above</option>
                <option value="4" ${loc.autoReplyMinimumRating === 4 ? 'selected' : ''}>4 & 5 Stars Only</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>AI Prompt Persona & Custom Instructions</label>
            <textarea id="setting-prompt-${loc.locationId}" class="form-input" rows="3">${escapeHtml(loc.customAiPrompt || '')}</textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Save Directives</button>
        </form>
      </div>
    </div>
  `).join('');
}

window.saveLocationSettings = async function(event, locationId) {
  event.preventDefault();
  const autoReplyEnabled = document.getElementById(`setting-autoreply-${locationId}`).value === 'true';
  const autoReplyMinimumRating = Number(document.getElementById(`setting-minrating-${locationId}`).value);
  const customAiPrompt = document.getElementById(`setting-prompt-${locationId}`).value;

  try {
    const res = await gmbFetch(`/api/locations/${locationId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoReplyEnabled, autoReplyMinimumRating, customAiPrompt })
    });
    const data = await res.json();
    if (data.success) {
      showAlert(`Updated settings for location.`, 'success');
      initAuth();
    } else {
      showAlert(data.message || 'Failed to update settings.', 'error');
    }
  } catch (err) {
    showAlert(err.message, 'error');
  }
};

async function updateOverviewStats() {
  document.getElementById('stat-locations-count').textContent = currentLocations.length;
  try {
    const revRes = await gmbFetch('/api/reviews?limit=1');
    const revData = await revRes.json();
    if (revData.success) {
      document.getElementById('stat-reviews-count').textContent = revData.total || 0;
    }

    const postRes = await gmbFetch('/api/posts?status=SCHEDULED&limit=1');
    const postData = await postRes.json();
    if (postData.success) {
      document.getElementById('stat-posts-count').textContent = postData.total || 0;
    }
  } catch (err) {
    console.error('Stats query warning:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
