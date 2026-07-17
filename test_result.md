#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## user_problem_statement: |
  Rebuild the app into a "Fitness Anatomy Trainer" — a mobile + web 3D skeletal & muscular
  anatomy learning app using an imported Ecorche FBX model (converted to GLB). Features:
  3D viewer (rotate/zoom/pan), tap-to-identify muscles, hierarchical anatomy explorer
  (isolate/hide systems & regions), Shrunken Muscle View via morph targets, Workout Mode
  (exercise -> highlighted primary/secondary muscles), Muscle Info reference DB. Replaces Apex AI.

## backend:
##   - task: "Serve GLB anatomy model"
##     implemented: true
##     working: "NA"
##     file: "backend/server.py"
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "GET /api/anatomy/model serves static ecorche.glb (5.6MB). Verified 200 locally + via proxy."

## frontend:
##   - task: "3D Anatomy Viewer (load/render/rotate/zoom/reset)"
##     implemented: true
##     working: "NA"
##     file: "src/anatomy/AnatomyViewer.tsx, src/anatomy/engine.ts"
##     priority: "high"
##     needs_retesting: true
##   - task: "Explore: hierarchy explorer isolate + hide systems + Show Full Body"
##     implemented: true
##     working: "NA"
##     file: "app/(tabs)/explore.tsx"
##     priority: "high"
##     needs_retesting: true
##   - task: "Explore: tap muscle -> detail sheet"
##     implemented: true
##     working: "NA"
##     file: "src/anatomy/MuscleSheet.tsx"
##     priority: "high"
##     needs_retesting: true
##   - task: "Shrunken Muscle View slider/buttons (morph targets)"
##     implemented: true
##     working: "NA"
##     file: "src/anatomy/ScrubSlider.tsx, engine.ts"
##     priority: "medium"
##     needs_retesting: true
##   - task: "Workout Mode: exercise selection highlights muscles"
##     implemented: true
##     working: "NA"
##     file: "app/(tabs)/workout.tsx"
##     priority: "high"
##     needs_retesting: true
##   - task: "Muscle Info: search + list + modal detail"
##     implemented: true
##     working: "NA"
##     file: "app/(tabs)/info.tsx"
##     priority: "medium"
##     needs_retesting: true

## metadata:
##   created_by: "main_agent"
##   version: "2.0"
##   test_sequence: 0

## test_plan:
##   current_focus:
##     - "3D Anatomy Viewer"
##     - "Explore hierarchy explorer"
##     - "Workout Mode highlight"
##   test_all: true
##   test_priority: "high_first"

## agent_communication:
##     -agent: "main"
##     -message: "Rebuilt app as Fitness Anatomy Trainer. 3D model renders on web (verified via screenshot). Please test all anatomy flows on web. No auth/login. Tabs: Explore, Workout, Muscle Info, Settings."
##     -agent: "main"
##     -message: |
##       [June 2026 - v1.1.0 feature release] FRONTEND-ONLY test scope (backend untouched this session):
##       1) Insights gesture fix (workout tab -> Insights segment; PREMIUM ONLY - login with
##          applereview@mazidigroup.com code 123456 via email flow to get premium):
##          - First finish a workout (Train seg -> add exercise -> Session -> fill weight/reps -> done -> Finish Workout)
##          - Insights now renders 3D recovery model full screen with a DRAGGABLE sheet (drag handle up/down)
##          - New v1.1.0 sections: period toggle (Last 7 days / Last 30 days, testID insights-period-week|month),
##            4 stat cards, streak card (testID insights-streak), Personal Records rows (testID pr-<exerciseId>),
##            Volume Trend chart (6 bars week / 12 bars month)
##       2) Library tab reorganization (public, guest OK):
##          - Segmented control (testID lib-seg-muscles / lib-seg-exercises)
##          - Exercises segment: group-by chips (lib-groupby-muscle|equipment|movement), rows testID lib-ex-<id>,
##            tap row -> /exercise/<id> detail; alias search: "ohp" -> Overhead Press, "lats" (muscles seg) -> Latissimus Dorsi
##          - Muscles segment: unchanged muscle reference + alias search support
##       3) Coach tab (PREMIUM ONLY): context-aware suggestions (with workout history they change),
##          send message -> streaming; KNOWN LIMITATION: Emergent LLM budget exhausted so reply may show
##          "couldn't reach the AI service" - that error bubble IS the expected mocked path, NOT a bug.
##          While streaming/busy a STOP button (testID coach-stop) replaces send; leaving screen cancels request.
##       4) Regression: Explore tab 3D + draggable sheet + muscle tap, Workout session logging flow, guest login.
##       Backend NOT modified - skip backend testing.
##     -agent: "main"
##     -message: |
##       [June 2026 - RepDB exercise animations] Test scope (frontend heavy + 3 new backend endpoints):
##       BACKEND (light): GET /api/exercise-media/manifest -> 32 entries (31 animation+poster, plank poster-only);
##       GET /api/exercise-media/bench-press/animation -> 200 image/webp; /poster -> 200; unknown id -> 404.
##       FRONTEND (guest OK for Library/detail):
##       1) Library -> Exercises segment: rows show REAL poster thumbnails (not icons) for all exercises
##       2) Exercise detail /exercise/bench-press: hero animation block (testID anim-hero-bench-press) autoplays,
##          pause/play toggle (anim-toggle-bench-press) works
##       3) Plank detail: poster image shown, NO play controls (static hold, poster-only by design)
##       4) REPLACED EXERCISES: 'cuban-rotation' and 'tibialis-raise' are GONE, replaced by
##          'cable-external-rotation' (Cable External Rotation, Pull/Cable) and 'single-leg-calf-raise'
##          (Single Leg Calf Raise, Legs/Bodyweight) - verify they appear in Library, have animations,
##          detail pages work, and searching 'cuban rotation' still finds Cable External Rotation via alias
##       5) MuscleSheet (Explore tab -> tap a shoulder muscle e.g. Infraspinatus via Library Muscles seg):
##          Best Exercises cards show poster thumb with small play badge; tapping thumb (anim-card-<id>)
##          starts animation; tapping another card stops the first (one-at-a-time)
##       6) Workout Session (premium not needed): add exercise -> Session seg shows animation block with
##          play/pause (anim-toggle-<id>) + replay (anim-replay-<id>) controls, paused poster by default
##       7) Regression: workout logging + finish flow, Insights (premium via applereview@mazidigroup.com/123456)
##     -agent: "main"
##     -message: |
##       [July 2026 - Apple resubmission fixes] Backend test scope:
##         1) DELETE /api/auth/me (new) — no token=401; valid token=200 {ok:true,deleted:true};
##            /auth/me with same token AFTER delete=401 (session revoked).
##            Also verify user + sessions + subscriptions + coach_messages + coach_ask_usage +
##            workouts docs for that user_id are gone from Mongo.
##         2) Full regression on prior 12 backend cases (guest/session, bypass, coach quota,
##            billing sync) — should all still pass.
##         3) Coach system prompt updated to include Sources block requirement (1.4.1). No
##            behavioural test needed beyond confirming /coach/ask still returns 200 SSE with
##            non-empty content on a health-related question.
##       Skip frontend UI screenshots — no visual regressions expected on tabs, viewer, workout.
##         1) POST /api/auth/guest — must issue guest session with is_guest:true and a session_token.
##         2) GET /api/auth/me (Bearer=guest token) — must return is_guest true, is_premium false.
##         3) POST /api/auth/email/request with a non-bypass address — must succeed (dev_code fallback OK if Resend fails).
##         4) POST /api/auth/email/verify — must issue a session; /api/auth/me returns is_guest:false.
##         5) Apple Review Bypass: email=applereview@mazidigroup.com code=123456 via /api/auth/email/verify — must return session AND /api/auth/me is_premium:true.
##         6) Bypass negative test: applereview@mazidigroup.com with wrong code → 401; other email + 123456 → 401.
##         7) POST /api/coach/ask (Bearer required) — no token = 401; guest token = 200 (subject to quota); rate limit works.
##         8) POST /api/billing/revenuecat/sync — auth required; syncs subscription doc.
##       Skip 3D viewer + frontend UI screenshots (already validated). Backend-only test.
