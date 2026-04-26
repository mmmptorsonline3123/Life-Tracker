# Auth Testing Playbook (Aura)

## Setup test session
```
mongosh aura_assistant --eval "
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Test backend
```
curl -X GET "https://<host>/api/auth/me" -H "Authorization: Bearer <SESSION_TOKEN>"
curl -X GET "https://<host>/api/dashboard" -H "Authorization: Bearer <SESSION_TOKEN>"
curl -X POST "https://<host>/api/tasks" -H "Authorization: Bearer <SESSION_TOKEN>" -H "Content-Type: application/json" -d '{"title":"X","priority":"medium"}'
```

## Browser testing
- Set cookie `session_token=<TOKEN>` for the preview origin (httpOnly, secure, SameSite=None) OR
- Set Authorization header via fetch interception, OR
- Pre-seed AsyncStorage by visiting login → manual flow

## Expected
- /api/auth/me returns user data
- All gated endpoints work with valid token, return 401 without
- /login redirect happens for unauthenticated users
