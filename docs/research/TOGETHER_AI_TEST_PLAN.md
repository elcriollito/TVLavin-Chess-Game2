# Together AI Integration - Test Plan

## Modified Files

### Backend
- `api/mentor/chat.js` - Major refactor for Together AI backend with credit system

### Frontend
- `js/caissa-feature-flags.js` - Added BYO_AI_KEY flag (default OFF)
- `js/llm-provider.js` - Updated isReady() and chat() for backend auth flow
- `mentor-ai.js` - Removed old credit logic, added UI hiding for BYO key mode

---

## Test Checklist

### 1. Guest User (Not Signed In)

**Setup:**
- Open app in incognito/private browsing mode
- Do NOT sign in

**Test Cases:**

- [ ] **TC-1.1: Mentor panel opens**
  - Click "Mentor" button
  - Expected: Panel opens, chat interface visible

- [ ] **TC-1.2: Send message without sign-in**
  - Load a chess position (or use starting position)
  - Type a question: "What should white play here?"
  - Click Send
  - Expected: Error message "Sign in required to use AI Mentor. Click the sign-in button to continue."
  - Expected: CaissaNotify.warn toast appears with "Sign in to use AI Mentor"

- [ ] **TC-1.3: Settings panel (feature flag OFF)**
  - Click settings icon in Mentor panel
  - Expected: Settings panel opens
  - Expected: API key input is HIDDEN
  - Expected: Provider dropdown is HIDDEN
  - Expected: Model dropdown is HIDDEN
  - Expected: Message shown: "Using default AI provider (Together AI). Sign in for free credits."
  - Expected: Stockfish guidance toggle is VISIBLE

- [ ] **TC-1.4: Settings panel (feature flag ON)**
  - Open browser console
  - Run: `flags.enable('BYO_AI_KEY')`
  - Reload page
  - Open Mentor settings
  - Expected: API key input is VISIBLE
  - Expected: Provider dropdown is VISIBLE
  - Expected: Model dropdown is VISIBLE

---

### 2. Free User (Signed In, Has Credits)

**Setup:**
- Sign in with a free account
- Verify user has at least 3 credits (check wallet in UI)

**Test Cases:**

- [ ] **TC-2.1: Send message with credits**
  - Load a chess position
  - Open Mentor panel
  - Type: "Analyze this position"
  - Click Send
  - Expected: Loading indicator appears
  - Expected: AI response appears in chat
  - Expected: Credits decreased by 1 (check wallet)
  - Expected: No error messages

- [ ] **TC-2.2: Send multiple messages**
  - Send 2 more messages
  - Expected: Each message consumes 1 credit
  - Expected: All responses appear correctly
  - Expected: Wallet updates after each message

- [ ] **TC-2.3: Settings panel shows simplified UI**
  - Open Mentor settings (feature flag OFF by default)
  - Expected: API key input is HIDDEN
  - Expected: Provider/model dropdowns are HIDDEN
  - Expected: Stockfish guidance toggle is VISIBLE
  - Expected: Message: "Using default AI provider (Together AI). Sign in for free credits."

---

### 3. Premium User (Unlimited AI Access)

**Setup:**
- Sign in with a premium account (or upgrade a test account)
- Verify "Premium" badge is visible

**Test Cases:**

- [ ] **TC-3.1: Send message (no credit consumption)**
  - Note current credit balance
  - Load a chess position
  - Send a Mentor message: "What's the best move?"
  - Expected: AI response appears
  - Expected: Credits NOT decreased (premium bypass)

- [ ] **TC-3.2: Multiple messages (no limits)**
  - Send 5-10 messages in quick succession
  - Expected: All messages get responses
  - Expected: No credit consumption
  - Expected: No rate limiting errors

- [ ] **TC-3.3: Premium badge visible**
  - Check top-right corner of app
  - Expected: "Premium" badge visible next to username

---

### 4. Zero Credits (Free User)

**Setup:**
- Sign in with a free account
- Use credits until balance = 0 (or manually set in Supabase: `UPDATE users SET credits = 0 WHERE clerk_id = '...'`)

**Test Cases:**

- [ ] **TC-4.1: Send message with zero credits**
  - Load a chess position
  - Open Mentor panel
  - Type: "Help me with this position"
  - Click Send
  - Expected: Error message "Insufficient credits. Purchase more credits or upgrade to Premium for unlimited AI access."
  - Expected: CaissaNotify.error toast with "Insufficient credits. Purchase more or upgrade to Premium."
  - Expected: No AI response (message not sent to backend)

- [ ] **TC-4.2: Check wallet UI**
  - Look at top-right corner wallet display
  - Expected: Shows "0 credits"
  - Expected: "Get Credits" button visible and functional

- [ ] **TC-4.3: Purchase credits flow**
  - Click "Get Credits" button
  - Expected: Checkout page opens
  - Expected: Can complete purchase (test mode)
  - After purchase: Credits increase, Mentor works again

---

### 5. Backend Misconfiguration

**Setup (requires Vercel dashboard access):**
- Go to Vercel project settings → Environment Variables
- Temporarily remove or rename `TOGETHER_API_KEY`
- Redeploy or wait for env var to sync

**Test Cases:**

- [ ] **TC-5.1: Missing TOGETHER_API_KEY**
  - Sign in as free or premium user
  - Send a Mentor message
  - Expected: Error response from backend (503 Service Unavailable)
  - Expected: Error code: `SERVICE_UNAVAILABLE`
  - Expected: Frontend shows: "AI service temporarily unavailable. Please try again in a moment."
  - Expected: CaissaNotify.error toast appears

- [ ] **TC-5.2: Invalid TOGETHER_API_KEY**
  - Set `TOGETHER_API_KEY` to invalid value (e.g., "invalid-key-123")
  - Redeploy
  - Send a Mentor message
  - Expected: Error from Together AI API (401 Unauthorized)
  - Expected: Backend logs error but doesn't expose key
  - Expected: Frontend shows generic error message

- [ ] **TC-5.3: Restore and verify**
  - Restore correct `TOGETHER_API_KEY`
  - Redeploy
  - Send a Mentor message
  - Expected: Normal operation resumes

---

### 6. Input Validation (Credit Protection)

**Setup:**
- Sign in as free user with 5 credits

**Test Cases:**

- [ ] **TC-6.1: Empty message**
  - Open Mentor panel
  - Click Send without typing anything
  - Expected: Frontend validation prevents send (no API call)
  - Expected: Credits NOT consumed

- [ ] **TC-6.2: Malformed request (missing messages array)**
  - Open browser console
  - Run:
    ```js
    fetch('/api/mentor/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.CaissaAuth.getToken()}`
      },
      body: JSON.stringify({ provider: 'together', messages: null })
    }).then(r => r.json()).then(console.log)
    ```
  - Expected: 400 Bad Request ("Messages array is required")
  - Expected: Credits NOT consumed (check wallet)

- [ ] **TC-6.3: Valid message consumes credit**
  - Send normal Mentor message
  - Expected: Credit consumed AFTER validation passes

---

### 7. Rate Limiting

**Setup:**
- Sign in as free user
- Ensure you have enough credits

**Test Cases:**

- [ ] **TC-7.1: Normal usage (within limits)**
  - Send 5 messages over 2-3 minutes
  - Expected: All messages succeed
  - Expected: No rate limit errors

- [ ] **TC-7.2: Rapid fire (exceed rate limit)**
  - Send 15+ messages in quick succession (within 1 minute)
  - Expected: After ~10 messages, receive 429 Rate Limited error
  - Expected: Error message: "Rate limit exceeded. Please try again later."
  - Expected: CaissaNotify.error toast

- [ ] **TC-7.3: Wait and retry**
  - Wait 10 minutes
  - Send another message
  - Expected: Rate limit reset, message succeeds

---

### 8. Error Handling & User Experience

**Test Cases:**

- [ ] **TC-8.1: Network offline**
  - Open DevTools → Network tab → Set to "Offline"
  - Send a Mentor message
  - Expected: Fetch fails with network error
  - Expected: User sees friendly error message (not raw error)

- [ ] **TC-8.2: Session expired**
  - Sign in, wait for Clerk session to expire (or manually clear auth token)
  - Send a Mentor message
  - Expected: 401 AUTH_REQUIRED error
  - Expected: "Your session has expired. Please sign in again."

- [ ] **TC-8.3: CaissaNotify integration**
  - Trigger various errors (zero credits, rate limit, etc.)
  - Expected: Toast notifications appear for all error types
  - Expected: Toasts auto-dismiss after 3-4 seconds
  - Expected: Multiple toasts stack (up to 3)

---

### 9. Engine-Guided Analysis

**Test Cases:**

- [ ] **TC-9.1: Stockfish guidance enabled**
  - Open Mentor settings
  - Ensure "Use Stockfish Guidance" is checked
  - Load a tactical position
  - Ask: "Analyze this position"
  - Expected: Message includes Stockfish evaluation data
  - Expected: AI response references top engine moves

- [ ] **TC-9.2: Stockfish guidance disabled**
  - Open Mentor settings
  - Uncheck "Use Stockfish Guidance"
  - Save settings
  - Ask: "What should I play?"
  - Expected: Message sent without engine data
  - Expected: AI gives human-style advice (no engine lines)

---

### 10. Security & Privacy

**Test Cases:**

- [ ] **TC-10.1: TOGETHER_API_KEY never exposed**
  - Open DevTools → Network tab
  - Send a Mentor message
  - Inspect request payload
  - Expected: `TOGETHER_API_KEY` NOT in request body
  - Expected: Only user's auth token visible

- [ ] **TC-10.2: Error messages don't leak secrets**
  - Cause various errors (backend down, invalid key, etc.)
  - Check all error messages in UI and Network responses
  - Expected: No API keys, env vars, or stack traces exposed

- [ ] **TC-10.3: Structured logging (backend)**
  - Check Vercel function logs
  - Expected: Logs are JSON-formatted
  - Expected: Errors logged with context (userId, action)
  - Expected: No sensitive data in logs

---

## Regression Tests (Ensure No Breaking Changes)

- [ ] **RT-1: Chess board still works**
  - Make moves, drag pieces, reset board
  - Expected: No errors, normal functionality

- [ ] **RT-2: Library still works**
  - Save a position to library
  - Load a position from library
  - Expected: No errors

- [ ] **RT-3: Insight still works**
  - Connect Chess.com account
  - Run CAISSA Insight
  - Expected: Analysis completes (may consume credits if free user)

- [ ] **RT-4: Position Forge still works**
  - Open Position Forge
  - Edit board position
  - Apply to main board
  - Expected: No errors

- [ ] **RT-5: Query Engine still works**
  - Open Query Engine
  - Enter natural language query
  - Expected: Results returned (may consume credits)

---

## Performance Tests

- [ ] **PT-1: First message response time**
  - Send first Mentor message (cold start)
  - Expected: Response within 5-10 seconds

- [ ] **PT-2: Subsequent message response time**
  - Send 2nd and 3rd messages
  - Expected: Response within 2-4 seconds (warm)

- [ ] **PT-3: Engine lock doesn't interfere**
  - Start Stockfish analysis (multi-PV mode)
  - Open Mentor, send message with Stockfish guidance
  - Expected: Engine lock acquired, analysis completes, lock released
  - Expected: Board analysis resumes after Mentor response

---

## Deployment Checklist

- [ ] **D-1: Environment variables set in Vercel**
  - `TOGETHER_API_KEY` ✓
  - `TOGETHER_MODEL=moonshotai/Kimi-K2.5` ✓
  - `TOGETHER_BASE_URL=https://api.together.xyz/v1` ✓

- [ ] **D-2: Feature flag default is OFF**
  - Verify `BYO_AI_KEY: false` in caissa-feature-flags.js

- [ ] **D-3: CSP headers allow Together AI**
  - Check CSP in Vercel config
  - Expected: `connect-src` includes `https://api.together.xyz`

- [ ] **D-4: Supabase credits column exists**
  - Check `users` table has `credits` column (INTEGER)
  - Check `is_premium` column exists (BOOLEAN)

- [ ] **D-5: Stripe webhooks configured**
  - Verify webhook endpoint: `/api/stripe/webhook`
  - Verify `invoice.paid` event adds credits

---

## Sign-Off

- [ ] All test cases pass
- [ ] No console errors in browser
- [ ] No 5xx errors in Vercel logs
- [ ] User experience is smooth and intuitive
- [ ] Error messages are helpful and actionable

**Tester:** _________________
**Date:** _________________
**Build Version:** _________________
**Notes:**

---

## Known Limitations

1. **Rate limiting resets on cold start** - In-memory rate limit map resets when serverless function restarts. Acceptable for MVP, will migrate to Upstash Redis later.

2. **BYO key mode requires manual feature flag** - Advanced users must run `flags.enable('BYO_AI_KEY')` in console. Future: Add UI toggle in settings (admin only).

3. **Insight credit cost TBD** - Currently not implemented in this phase. Will add in follow-up PR.

---

## Rollback Plan

If critical issues found in production:

1. **Immediate:** Set feature flag `BYO_AI_KEY: true` in caissa-feature-flags.js (re-enables old flow)
2. **Quick fix:** Revert `api/mentor/chat.js` to previous version
3. **Full rollback:** Git revert entire commit

**Rollback command:**
```bash
git revert HEAD
git push origin main
```

Vercel will auto-deploy the revert.
