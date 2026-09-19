# Yapply — Design Document

## 1. Overview

This product is a fast-paced, voice-first language learning game inspired by the spontaneity of Omegle-style random matching, the progression systems of language-learning apps, and competitive multiplayer games.

Players enter short conversations with:

- a random human,
- a friend,
- or an AI conversation partner.

Each session is designed as a game rather than an open-ended language exchange. Players receive a challenge, speak for a short period of time, and are graded on the quality of the conversation.

The primary product loop is:

> **Match → Speak → Complete a challenge → Get scored → Learn from feedback → Play again**

The core differentiator is not simply “talk to someone in another language.” It is:

> **Competitive 60–120 second speaking games that force players to actively use the language.**

---

## 2. Product Goals

The product should make speaking practice:

- fast,
- repeatable,
- social,
- competitive,
- measurable,
- low-friction.

A player should be able to open the app and begin speaking within seconds.

The system should encourage players to:

- speak primarily in the target language,
- use new vocabulary,
- respond naturally,
- ask follow-up questions,
- improve grammar,
- improve fluency,
- improve pronunciation,
- become more comfortable speaking spontaneously.

The product should avoid feeling like a traditional tutoring application.

---

## 3. Core User Experience

### 3.1 Match Setup

A player selects:

```text
Native Language:
English

Learning:
Spanish

Level:
B1

Match Type:
[ Random ]
[ Friend ]
[ AI ]

Game Mode:
[ Casual ]
[ Ranked ]
[ Challenges ]
```

Optional matchmaking preferences:

```text
Looking for:
☑ Native Spanish speakers
☑ Spanish learners
☑ Anyone
```

---

### 3.2 Match Start

Example:

```text
SPANISH — B1
2 MINUTE MATCH

Opponent found.

🎯 CHALLENGE

Convince your partner to visit your hometown.

BONUS:
• Use the past tense twice
• Ask two follow-up questions

3
2
1

GO
```

The voice call begins immediately.

During the conversation, the system silently:

- captures audio,
- transcribes speech,
- tracks speaking turns,
- measures response timing,
- detects target-language usage,
- evaluates pronunciation,
- records challenge completion signals.

The player should not be distracted by detailed grading while speaking.

---

## 4. Match Types

### 4.1 Random Human

Match a player with another compatible learner or native speaker.

Possible matching inputs:

- target language,
- native language,
- proficiency level,
- region,
- skill rating,
- preferred game mode,
- age restrictions,
- blocked users,
- matchmaking reputation.

A particularly useful language-exchange pairing is:

```text
Player A
Native: English
Learning: Spanish

Player B
Native: Spanish
Learning: English
```

The game could alternate languages:

```text
Round 1 — Spanish
Round 2 — English
```

---

### 4.2 Friends

Players can invite someone directly.

Potential flows:

- username invite,
- friend list,
- room code,
- shareable link,
- challenge rematch.

Friend matches could allow:

- custom language,
- custom difficulty,
- custom duration,
- custom challenge,
- ranked or unranked mode.

---

### 4.3 AI Conversation Partner

An AI agent joins the same voice session as a human participant.

AI partners can represent different personalities, situations, and difficulty levels.

Examples:

```text
👵 Spanish Grandmother
Level: A2
Style: Slow and patient

🥐 Parisian Waiter
Level: B1
Style: Natural conversation

👔 German Job Interviewer
Level: C1
Style: Formal

🧑‍🎓 Japanese Exchange Student
Level: A2
Style: Casual

😈 Speed Round AI
Level: C2
Style: Fast, interrupts naturally
```

AI opponents can dynamically adapt difficulty based on player performance.

---

## 5. Game Modes and Speaking Challenges

Random conversation alone can become repetitive. Challenges give every conversation an objective.

### 5.1 Secret Word

The player must naturally use a specific word during the conversation.

Example:

```text
SECRET WORD:
elefante
```

Bonus points if the opponent does not realize it was required.

### 5.2 Question Master

Ask a certain number of meaningful follow-up questions.

### 5.3 No English

Players lose bonus points or hearts whenever they switch away from the target language.

### 5.4 Grammar Quest

Require the player to use certain grammatical structures.

Examples:

- use three past-tense verbs,
- use the future tense twice,
- use a conditional sentence,
- use two comparative constructions.

### 5.5 Persuasion

The player must convince the other participant of something.

Examples:

- visit your city,
- choose your restaurant,
- buy a fictional product,
- change a travel plan.

### 5.6 Roleplay

Examples:

- restaurant ordering,
- job interview,
- hotel check-in,
- airport conversation,
- meeting someone for the first time,
- returning a product,
- asking for directions.

### 5.7 Describe It

One player describes an object without saying its name. The other person must guess it.

### 5.8 Twenty Questions

One player thinks of something and the other must identify it through questions.

### 5.9 Story Chain

Players alternate sentences while building a story.

### 5.10 Speed Round

Players have only a few seconds to begin responding.

This tests spontaneous language production.

### 5.11 Vocabulary Duel

Each response must introduce vocabulary that has not already been used.

### 5.12 Imposter

Players receive similar but slightly different prompts.

They need to discover who has the different prompt while remaining in the target language.

### 5.13 Pronunciation Battle

Players pronounce increasingly difficult words or phrases.

A pronunciation model scores each attempt.

---

## 6. Conversation Scoring

The system should not ask one model to produce an unexplained single score.

Scores should be decomposable and understandable.

Recommended categories:

| Dimension | Description |
|---|---|
| Conversation | Relevance, responsiveness, follow-ups, natural interaction |
| Fluency | Pauses, hesitation, speaking rate, conversational flow |
| Pronunciation | Acoustic pronunciation quality |
| Grammar | Correct grammar relative to expected proficiency |
| Vocabulary | Range, difficulty, context, and correctness |

An example weighting:

```text
Conversation     25%
Fluency          20%
Pronunciation    20%
Grammar          20%
Vocabulary       15%
```

Example:

```text
Conversation Score: 82

Fluency          86
Pronunciation    74
Grammar          81
Vocabulary       79
Conversation     91

🔥 7-turn conversation
🇪🇸 96% Spanish
🗣 54 sec speaking
💬 4 follow-up questions

Needs work:
"desarrollar"
"alrededor"
rolled Spanish "r"

+43 XP
```

Challenge completion should primarily award XP or bonuses rather than heavily distort the underlying language skill score.

---

## 7. Secondary Match Metrics

Not every metric needs to affect the player's score.

Useful statistics include:

```text
Target language spoken: 94%
Total speaking time:    1m 12s
Conversation turns:     11
Average response time:  1.8s
Unique words:           63
New words attempted:    7
Follow-up questions:    4
```

These statistics can help make progress visible without turning every behavior into a competitive ranking.

---

## 8. Pronunciation Scoring

Pronunciation must be treated separately from speech recognition.

Speech-to-text answers:

> “What words did the player say?”

Pronunciation assessment answers:

> “How accurately did they produce the sounds?”

A user can have poor pronunciation while still being correctly transcribed.

Therefore:

```text
Speech Recognition != Pronunciation Assessment
```

Pronunciation scoring should analyze the audio signal directly.

Potential metrics:

- phoneme accuracy,
- word-level pronunciation,
- fluency,
- rhythm,
- prosody,
- stress,
- speaking pace,
- pause patterns.

Important product principle:

> A noticeable accent should not automatically imply poor communication ability.

Pronunciation and conversation quality should remain separate dimensions.

---

## 9. Recommended Speech Technology

### 9.1 Browser SpeechRecognition / Chrome Voice API

The Web Speech API can be useful for an early prototype.

Example:

```javascript
const recognition = new SpeechRecognition();
recognition.lang = "es-ES";
```

Benefits:

- extremely fast to prototype,
- built into some browsers,
- supports multiple languages via locale settings,
- minimal backend infrastructure.

Limitations:

- inconsistent browser support,
- implementation differences between browsers,
- limited control,
- not suitable as the primary pronunciation engine,
- speech recognition quality may vary,
- may depend on browser/provider infrastructure.

Recommendation:

> Use Browser SpeechRecognition for a weekend prototype, not as the long-term speech platform.

### 9.2 ElevenLabs

ElevenLabs is a strong candidate for:

- multilingual speech-to-text,
- realtime transcription,
- AI voice output,
- conversational AI characters.

Potential flow:

```text
Audio
  ↓
ElevenLabs Speech-to-Text
  ↓
Transcript + timing metadata
```

From the transcript and timestamps, the application can estimate:

- words per minute,
- pause frequency,
- filler frequency,
- target-language percentage,
- conversation turns,
- response latency.

ElevenLabs is particularly useful for the AI opponent because it can provide natural realtime voice output.

It should not be the sole source of pronunciation scoring unless it exposes sufficient acoustic pronunciation information for the desired language.

### 9.3 Azure Speech Pronunciation Assessment

Azure Speech Pronunciation Assessment is a strong candidate for pronunciation grading.

Potential outputs include:

- pronunciation accuracy,
- fluency,
- prosody,
- word-level scores,
- phoneme-level information where available.

Proposed usage:

```text
Microphone Audio
       │
       ├────────────→ ElevenLabs STT
       │                    │
       │                    ▼
       │               Transcript
       │
       └────────────→ Azure Speech
                            │
                            ▼
                 Pronunciation Metrics
```

The results can then be combined by the scoring engine.

---

## 10. LLM-Based Conversation Grading

An LLM can evaluate transcript-level language quality.

Example input:

```json
{
  "targetLanguage": "Spanish",
  "level": "B1",
  "challenge": "Convince the other speaker to visit your city",
  "turns": [
    {
      "speaker": "player",
      "text": "..."
    },
    {
      "speaker": "partner",
      "text": "..."
    }
  ]
}
```

Example output:

```json
{
  "grammar": 81,
  "vocabulary": 77,
  "conversation": 92,
  "challengeCompleted": true,
  "mistakes": [
    {
      "original": "Yo fue...",
      "correction": "Yo fui...",
      "explanation": "Incorrect conjugation of ir in the preterite."
    }
  ],
  "strongMoments": [
    {
      "text": "...",
      "reason": "Natural follow-up question."
    }
  ]
}
```

The system should use:

- a fixed rubric,
- constrained structured output,
- proficiency-aware expectations,
- deterministic scoring instructions where possible,
- periodic evaluation against human graders.

This is important because users will quickly lose trust if the score feels arbitrary.

---

## 11. Human Feedback

The opponent should not directly determine another user's language ability score.

This prevents:

- trolling,
- retaliation,
- score manipulation,
- popularity contests.

Instead:

```text
SYSTEM SCORE

Pronunciation
Grammar
Vocabulary
Fluency
Conversation
Challenge Completion
```

Human feedback can remain lightweight:

```text
PARTNER FEEDBACK

👍 Easy to understand
😄 Fun conversation
🤝 Would talk again
```

Human feedback can contribute to:

- matchmaking reputation,
- toxicity detection,
- social recommendations,
- rematch suggestions.

It should not directly become:

```text
Your Spanish score = 63
```

---

## 12. Rankings and Progression

Players could maintain language-specific ratings.

Example:

```text
Spanish Rating: 1284

Pronunciation: 1190
Conversation:  1362

Rank:
B1 III

🔥 8 game streak
```

Possible progression systems:

- XP,
- levels,
- leagues,
- Elo/MMR,
- language ranks,
- challenge streaks,
- weekly goals,
- achievements,
- vocabulary mastery.

Ratings should be language-specific.

A player's Spanish rating should not affect their French rating.

---

## 13. Realtime Architecture

Recommended architecture:

```text
Next.js / React Client
        │
        ▼
     LiveKit
      WebRTC
        │
 ┌──────┴──────────────┐
 │                     │
 ▼                     ▼
Human Audio        Audio Processing
                         │
                ┌────────┴─────────┐
                ▼                  ▼
          Speech-to-Text     Pronunciation
                │               Scoring
                ▼                  │
           Transcript              │
                └────────┬─────────┘
                         ▼
                     Score Engine
                         │
                         ▼
                 Postgres / Stats
```

---

## 14. Recommended Technology Stack

### Frontend

```text
Next.js
React
TypeScript
```

Responsibilities:

- onboarding,
- matchmaking UI,
- game screens,
- transcript display,
- challenge prompts,
- score screens,
- profile/progression,
- WebRTC client.

### Realtime Voice

```text
LiveKit
WebRTC
```

Responsibilities:

- voice rooms,
- media transport,
- participant state,
- human-human calls,
- human-AI calls,
- realtime events.

LiveKit avoids having to build raw WebRTC signaling, room infrastructure, reconnect handling, and NAT traversal from scratch.

### Backend

Either:

```text
TypeScript / Node.js
```

or:

```text
Go
```

Responsibilities:

- users,
- matchmaking,
- games,
- challenges,
- scores,
- rankings,
- invitations,
- moderation,
- analytics.

### Matchmaking

```text
Redis
```

Potential data structures:

```text
queue:es:B1
queue:es:B2
queue:fr:A2
```

Matchmaking service can combine:

- language,
- proficiency,
- rating,
- wait time,
- native language,
- geographic latency,
- reputation.

### Persistent Storage

```text
PostgreSQL
```

Store:

- users,
- language profiles,
- matches,
- scores,
- challenges,
- vocabulary,
- ratings,
- reports,
- friendships.

### Speech-to-Text

Primary candidate:

```text
ElevenLabs Scribe
```

Prototype candidate:

```text
Browser SpeechRecognition
```

### Pronunciation

Primary candidate:

```text
Azure Speech Pronunciation Assessment
```

### AI Conversation

Potential pipeline:

```text
STT
 ↓
LLM
 ↓
TTS
```

An AI agent can join the same LiveKit room as another participant.

### LLM

Use an LLM for:

- conversation scoring,
- grammar feedback,
- vocabulary analysis,
- challenge evaluation,
- AI conversation,
- scenario generation,
- correction generation.

---

## 15. Match Lifecycle

A match can be modeled as:

```text
QUEUED
  ↓
MATCHED
  ↓
CONNECTING
  ↓
READY
  ↓
PLAYING
  ↓
PROCESSING
  ↓
RESULTS
  ↓
COMPLETE
```

Potential failure states:

```text
CANCELLED
DISCONNECTED
ABANDONED
MODERATION_ENDED
```

---

## 16. Example Backend Flow

### Step 1 — Join Queue

```http
POST /api/matchmaking/join
```

```json
{
  "language": "es",
  "level": "B1",
  "mode": "challenge"
}
```

### Step 2 — Match Found

Server creates:

```text
match_id
livekit_room_id
challenge_id
```

### Step 3 — Players Connect

Both clients connect to the WebRTC room.

### Step 4 — Game Starts

Server emits:

```json
{
  "event": "game_started",
  "duration": 120,
  "challenge": {
    "type": "persuasion",
    "prompt": "Convince your partner to visit your hometown."
  }
}
```

### Step 5 — Audio Processing

Audio is sent to:

```text
STT pipeline
Pronunciation pipeline
```

### Step 6 — Conversation Ends

The backend stores:

- transcript,
- timing,
- challenge events,
- acoustic metrics.

### Step 7 — Score Generation

The score engine combines:

```text
LLM evaluation
+
pronunciation assessment
+
objective conversation metrics
+
challenge completion
```

### Step 8 — Results

Clients receive a structured score object.

---

## 17. Example Score Object

```json
{
  "overall": 82,
  "dimensions": {
    "conversation": 91,
    "fluency": 86,
    "pronunciation": 74,
    "grammar": 81,
    "vocabulary": 79
  },
  "metrics": {
    "targetLanguagePercentage": 96,
    "speakingSeconds": 54,
    "turns": 7,
    "followUpQuestions": 4,
    "uniqueWords": 63
  },
  "challenge": {
    "completed": true,
    "bonusXp": 12
  },
  "xpEarned": 43
}
```

---

## 18. Proposed Data Model

### User

```text
User
- id
- username
- created_at
- reputation_score
```

### LanguageProfile

```text
LanguageProfile
- user_id
- language
- native
- cefr_level
- overall_rating
- pronunciation_rating
- conversation_rating
- xp
```

### Match

```text
Match
- id
- mode
- language
- level
- challenge_id
- started_at
- ended_at
- status
```

### MatchParticipant

```text
MatchParticipant
- match_id
- user_id
- speaking_seconds
- target_language_percent
- overall_score
- xp_earned
```

### Score

```text
Score
- match_id
- user_id
- conversation
- fluency
- pronunciation
- grammar
- vocabulary
- challenge_bonus
```

### Challenge

```text
Challenge
- id
- type
- language
- min_level
- max_level
- prompt
- scoring_rules
```

### TranscriptTurn

```text
TranscriptTurn
- match_id
- speaker_id
- text
- start_time
- end_time
- detected_language
```

### PronunciationResult

```text
PronunciationResult
- match_id
- user_id
- word
- phoneme
- score
- timestamp
```

---

## 19. Safety and Moderation

An Omegle-style product requires moderation to be designed from the beginning.

Important protections:

- block user,
- report user,
- leave match instantly,
- profanity/toxicity detection,
- spam detection,
- repeated harassment detection,
- matchmaking reputation,
- account-level enforcement,
- optional conversation recording policies,
- age-aware matchmaking.

Voice moderation can operate on realtime transcripts.

Potential workflow:

```text
Audio
 ↓
STT
 ↓
Safety classifier
 ↓
Warning / Match termination / Report
```

Never make users stay in a match because leaving would hurt their rating.

---

## 20. Privacy

Voice products require clear data handling.

The product should explicitly define:

- whether raw audio is stored,
- how long transcripts are retained,
- whether transcripts are used for model improvement,
- whether users can delete conversation history,
- whether conversation partners can save recordings.

A privacy-friendly architecture could store only:

```text
transcript
derived scores
selected pronunciation snippets
```

and discard raw conversation audio after processing unless the user explicitly opts into saving it.

---

## 21. Anti-Cheating

Ranked modes create incentives to manipulate scores.

Potential abuse:

- prerecorded audio,
- AI-generated audio,
- reading prepared scripts,
- intentionally farming easy opponents,
- repeatedly matching friends,
- leaving losing matches,
- microphone playback attacks.

Possible mitigations:

- separate ranked and casual modes,
- random dynamic prompts,
- spontaneous follow-up challenges,
- rematch limits for rating changes,
- disconnect penalties only when appropriate,
- suspicious audio detection,
- rating confidence.

---

## 22. Rating System

An Elo-like or Glicko-style system could be used for competitive matchmaking.

However, language ability is multidimensional.

Potential ratings:

```text
Overall Language Rating
Conversation Rating
Pronunciation Rating
```

Players could see:

```text
Spanish
B1 III

Overall:        1284
Conversation:   1362
Pronunciation:  1190
```

CEFR labels should ideally be treated as approximate skill bands unless validated against formal CEFR assessment criteria.

---

## 23. Feedback Experience

Post-game feedback should be short enough that players immediately want another match.

Primary screen:

```text
82

Great conversation!

Conversation     91
Fluency          86
Grammar          81
Vocabulary       79
Pronunciation    74

+43 XP

[ PLAY AGAIN ]
```

Expandable feedback:

```text
3 things to improve

1. Yo fue → Yo fui
2. desarrollar — pronunciation
3. Try using more connecting phrases
```

The goal is:

```text
play → feedback → replay
```

not:

```text
play → read a ten-minute language report
```

---

## 24. AI Difficulty

AI opponents can adapt across several dimensions.

### Vocabulary

```text
A1: common basic vocabulary
B1: normal conversational vocabulary
C1: idioms and advanced expressions
```

### Speaking Speed

```text
Slow
Normal
Native
Fast
```

### Helpfulness

```text
Tutor
Friendly
Natural
Unforgiving
```

### Conversation Behavior

```text
waits patiently
asks follow-ups
interrupts occasionally
uses slang
corrects mistakes
does not correct mistakes
```

This creates significantly more interesting difficulty settings than simply changing an LLM prompt.

---

## 25. Challenge Generation

Challenges can initially be predefined.

Later, an LLM can generate them dynamically based on:

- language,
- proficiency,
- vocabulary history,
- recent mistakes,
- user interests,
- previously played scenarios.

Example:

```text
User repeatedly struggles with past tense.
```

The game can generate:

```text
Tell your partner what you did last weekend.

Bonus:
Use five past-tense verbs.
```

This makes gameplay itself a personalized learning curriculum.

---

## 26. Vocabulary System

Each player can maintain a personal vocabulary graph.

Track:

```text
encountered
understood
used successfully
misused
pronounced correctly
mastered
```

A word might progress:

```text
NEW
 ↓
SEEN
 ↓
USED
 ↓
REPEATED
 ↓
MASTERED
```

Future challenges can intentionally reintroduce vocabulary that needs reinforcement.

---

## 27. Observability

The system should measure both technical and product quality.

### Technical Metrics

- WebRTC connection success,
- packet loss,
- latency,
- disconnect rate,
- transcription latency,
- transcription errors,
- pronunciation API latency,
- LLM grading latency,
- score-generation failures.

### Product Metrics

- matches per user,
- average matches per session,
- match completion rate,
- rematch rate,
- friend-add rate,
- percentage of target language spoken,
- challenge completion rate,
- seven-day retention,
- AI vs human match usage,
- reports per 1,000 matches.

Distributed tracing would be especially useful because one game crosses multiple systems:

```text
matchmaking
→ room creation
→ realtime audio
→ STT
→ pronunciation
→ grading
→ database
→ results
```

---

## 28. Latency Targets

Realtime speech products are extremely latency-sensitive.

Possible targets:

```text
Human audio transport       < 200 ms
Partial STT                 < 500 ms
AI response start           < 1 sec ideal
Matchmaking                 < 5 sec ideal
Post-game score             < 3 sec ideal
```

Human-human conversations do not require AI inference in the critical audio path.

That is important.

The realtime media flow should remain:

```text
User A ↔ WebRTC ↔ User B
```

instead of:

```text
User A → AI backend → User B
```

Speech analysis should happen asynchronously alongside the call.

---

## 29. MVP

The first version should be intentionally narrow.

### Languages

```text
English ↔ Spanish
```

### Match Types

```text
Random Human
Friend
AI
```

### Duration

```text
60–120 seconds
```

### Game Modes

Start with roughly five challenge types:

1. Persuasion
2. Question Master
3. No English
4. Grammar Quest
5. Roleplay

### Feedback

Score:

- conversation,
- grammar,
- vocabulary,
- fluency,
- pronunciation.

Also show:

- three corrections,
- XP gained,
- challenge completion.

### MVP Stack

```text
Frontend:
Next.js + React + TypeScript

Realtime:
LiveKit / WebRTC

Backend:
TypeScript or Go

Matchmaking:
Redis

Database:
PostgreSQL

STT:
ElevenLabs Scribe

Pronunciation:
Azure Speech Pronunciation Assessment

Conversation grading:
LLM with structured output

AI voice:
ElevenLabs or equivalent realtime TTS
```

---

## 30. Prototype Before MVP

For an extremely fast prototype:

```text
Next.js
Browser SpeechRecognition
LLM grading
AI text/voice opponent
Postgres
```

Skip initially:

- sophisticated rankings,
- many languages,
- video,
- detailed phoneme visualizations,
- complex social graph,
- custom challenges,
- tournaments.

The purpose of the prototype is to validate:

> **Do people want to repeatedly play short scored language conversations?**

If yes, invest in the deeper realtime speech stack.

---

## 31. Development Phases

### Phase 0 — Prototype

Build:

- one language pair,
- AI matches,
- browser STT,
- simple challenge,
- transcript grading,
- post-match score.

Validate core engagement.

### Phase 1 — Multiplayer MVP

Add:

- LiveKit,
- human matchmaking,
- friend rooms,
- Redis queues,
- production STT,
- pronunciation assessment,
- user profiles,
- XP.

### Phase 2 — Game Systems

Add:

- ratings,
- leagues,
- streaks,
- challenge library,
- progression,
- vocabulary tracking,
- rematches.

### Phase 3 — Personalization

Add:

- adaptive challenges,
- weakness targeting,
- vocabulary reinforcement,
- AI difficulty adaptation,
- personalized practice plans.

### Phase 4 — Social / Competitive

Add:

- friends,
- parties,
- tournaments,
- leaderboards,
- clubs,
- creator-made challenges,
- seasonal rankings.

---

## 32. Key Product Risks

### Score Trust

If grading feels arbitrary, the entire competitive loop breaks.

Mitigation:

- transparent component scores,
- consistent rubrics,
- objective metrics where possible,
- human benchmark evaluations.

### Match Quality

Poor matches can ruin retention.

Mitigation:

- rating-based matchmaking,
- reputation system,
- easy skips,
- rematches,
- AI fallback.

### Toxicity

Random voice chat introduces substantial moderation risk.

Mitigation:

- transcript moderation,
- reporting,
- blocking,
- reputation,
- enforcement,
- sensible age restrictions.

### Latency

Slow transcription or AI responses make conversations feel unnatural.

Mitigation:

- stream everything,
- keep analysis outside the human-human critical media path,
- minimize sequential model calls.

### Cost

Realtime STT + pronunciation + LLM + TTS can become expensive.

Mitigation:

- human-human games require no TTS,
- evaluate pronunciation selectively,
- batch post-match grading,
- use smaller models for simple classifications,
- cache generated challenges,
- avoid storing unnecessary raw audio.

---

## 33. Product Thesis

The strongest version of the product is not:

> “Omegle for learning Spanish.”

It is:

> **A competitive voice game where players practice a language through short, spontaneous conversations and receive immediate measurable feedback.**

The combination of:

- random social interaction,
- AI fallback,
- speaking challenges,
- pronunciation grading,
- conversation scoring,
- progression,
- and extremely short matches

creates a loop that could make speaking practice feel more like multiplayer gaming than studying.
