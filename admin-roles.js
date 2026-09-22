/* Ordinary V2 administrator assignment. Authorization is enforced in PostgreSQL. */
'use strict';
var ADMIN_USERS = [], ADMIN_ROLE_BUSY = false, ADMIN_USERS_REQUEST = 0;

async function renderUsersAdmin() {
  var body = document.getElementById('adminBody'), request = ++ADMIN_USERS_REQUEST;
  body.innerHTML = '<div class="muted">Loading users...</div>';
  try {
    var rows = await rpc('eaf_v2_gateway_staff_directory', {});
    if (request !== ADMIN_USERS_REQUEST || CURRENT_ADMIN_TAB !== 'users') return;
    ADMIN_USERS = rows;
    var actor = rows.find(function(u) { return BOOT && BOOT.user && u.id === BOOT.user.id; });
    var canAssign = !!(actor && actor.is_super_admin);
    body.innerHTML = '<div class="admin-section-note">Gateway app access and detailed HR permissions remain separate. ' +
      'Administrators have full gateway access and can prepare HR Letters. A different super administrator must approve and issue them. ' +
      'Only super administrators may grant or revoke the ordinary Administrator role.</div>' + rows.map(function(u, index) {
      var admin = u.is_admin || u.is_super_admin;
      var role = u.is_super_admin ? 'Super Administrator' : (u.is_admin ? 'Administrator' : 'User');
      var action = '';
      if (canAssign && u.id !== actor.id && !u.is_super_admin) {
        action = '<button class="small-btn' + (u.is_admin ? ' danger' : '') + '" data-admin-role="' + index + '" ' +
          (ADMIN_ROLE_BUSY || (!u.is_admin && u.account_status !== 'active') ? 'disabled' : '') + '>' +
          (u.is_admin ? 'Revoke Administrator' : 'Grant Administrator') + '</button>';
      }
      return '<div class="user-row"><div class="user-top"><div class="user-id"><strong>' + esc(u.full_name || u.email) +
        '</strong><small>' + esc(u.email) + '</small></div><span class="status-pill">' + esc(u.account_status) + '</span></div>' +
        '<div class="admin-toolbar"><span class="full-access">' + role + (u.is_super_admin ? ' — Protected' : '') + '</span>' + action + '</div>' +
        (admin ? '<div class="full-access">Full access to all gateway applications</div>' : '<div class="user-access">' +
          accessCheck(u, 'apply', 'Apply') + accessCheck(u, 'hr', 'HR') + accessCheck(u, 'jd_manual', 'JD Manual') + accessCheck(u, 'hr_law', 'HR Law') + '</div>') + '</div>';
    }).join('');
    body.querySelectorAll('[data-admin-role]').forEach(function(button) {
      button.addEventListener('click', function() { changeAdministrator(Number(button.dataset.adminRole)); });
    });
  } catch (e) {
    if (request === ADMIN_USERS_REQUEST && CURRENT_ADMIN_TAB === 'users') {
      ADMIN_USERS = [];
      body.innerHTML = '<div role="alert" style="color:#ef4444">Could not load users: ' + esc(e.message) + '</div>';
    }
  }
}

async function changeAdministrator(index) {
  if (ADMIN_ROLE_BUSY) return;
  var target = ADMIN_USERS[index];
  var actor = ADMIN_USERS.find(function(u) { return BOOT && BOOT.user && u.id === BOOT.user.id; });
  if (!actor || !actor.is_super_admin || !target || target.is_super_admin || target.id === actor.id) return;
  var enabled = !target.is_admin;
  if (enabled && target.account_status !== 'active') return;
  var verb = enabled ? 'Grant' : 'Revoke';
  var impact = enabled ? 'This grants full V2 administrator access, including preparing HR Letters. It does not grant Super Administrator or letter approval authority.' :
    'This removes V2 administrator access. The user will retain their individually assigned app and HR permissions.';
  if (!confirm(verb + ' Administrator for ' + (target.full_name || target.email) + ' (' + target.email + ')?\n\n' + impact +
    '\n\nExisting permission flags are preserved. This role change will be recorded in the Access Log.')) return;
  ADMIN_ROLE_BUSY = true;
  document.querySelectorAll('[data-admin-role]').forEach(function(b) { b.disabled = true; });
  try {
    var result = await rpc('eaf_v2_set_administrator', {
      p_user_id: target.id, p_enabled: enabled, p_expected_is_admin: !!target.is_admin
    });
    if (result !== enabled) throw new Error('Unexpected server response. Refresh Users to verify the role.');
    showToast('Administrator ' + (enabled ? 'granted to ' : 'revoked for ') + (target.full_name || target.email) + '. Audit recorded.');
  } catch (e) {
    alert('Could not confirm administrator change: ' + e.message + '\nThe user list will refresh. Check the role before trying again.');
  } finally {
    ADMIN_ROLE_BUSY = false;
    if (CURRENT_ADMIN_TAB === 'users') await renderUsersAdmin();
  }
}
