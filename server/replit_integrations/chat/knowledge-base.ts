export interface KnowledgeLayer {
  id: string;
  name: string;
  topics: string[];
  content: string;
}

export const KNOWLEDGE_LAYERS: KnowledgeLayer[] = [
  {
    id: "philosophy",
    name: "Philosophical Foundation",
    topics: [
      "philosophy", "stoicism", "stoic", "marcus aurelius", "epictetus", "seneca",
      "existentialism", "sartre", "camus", "kierkegaard", "buddhism", "buddha",
      "taoism", "tao", "meaning", "purpose", "values", "virtue", "wisdom",
      "meditation", "mindfulness", "impermanence", "suffering", "attachment",
      "control", "fate", "death", "mortality", "memento mori", "amor fati",
      "wu wei", "yin yang", "eightfold path", "four noble truths", "absurd",
      "authenticity", "freedom", "responsibility", "gratitude", "perspective",
      "spirituality", "spiritual", "zen", "dharma", "karma", "enlightenment",
      "detachment", "acceptance", "surrender", "ego", "consciousness", "presence",
      "nihilism", "existential", "belief system", "worldview", "principles"
    ],
    content: `PHILOSOPHICAL FOUNDATION - Core Operating Principles

Stoicism (Marcus Aurelius, Epictetus, Seneca)
Key principles:
- Dichotomy of Control: Focus only on what you can control (thoughts, actions, responses). Accept what you cannot (external events, others' opinions, outcomes)
- Memento Mori: Remember you will die - clarifies priorities, reduces trivial concerns
- Amor Fati: Love your fate - embrace what happens, find opportunity in adversity
- Negative visualization: Imagine losing what you have to increase gratitude
- View from above: Zoom out to cosmic perspective to reduce ego and anxiety
Daily practices:
- Morning meditation: "What would I do if this were my last day?"
- Evening review: "What did I do well? What could I improve?"
- Voluntary discomfort: Cold showers, fasting, simplicity

Existentialism (Kierkegaard, Sartre, Camus)
Core concepts:
- Existence precedes essence: You are not born with predetermined purpose - you create it
- Radical freedom and responsibility: You are completely free, therefore completely responsible
- Authenticity: Live according to your own values, not society's expectations
- The Absurd (Camus): Life has no inherent meaning, yet we seek it - embrace this paradox
- "One must imagine Sisyphus happy" - find meaning in the struggle itself
Application:
- Create your own values and meaning
- Take full responsibility for your choices
- Don't blame circumstances or others
- Embrace freedom as both terrifying and empowering
- Authentic action over passive existence

Buddhism
Four Noble Truths:
1. Dukkha: Suffering/dissatisfaction exists
2. Samudaya: Suffering arises from craving/attachment
3. Nirodha: Suffering can cease
4. Magga: Path to end suffering (Eightfold Path)
Noble Eightfold Path:
- Right View: See reality clearly (impermanence, non-self)
- Right Intention: Cultivate wholesome motivations
- Right Speech: Truthful, kind, necessary, timely
- Right Action: Ethical conduct (don't harm)
- Right Livelihood: Work that doesn't cause suffering
- Right Effort: Cultivate good, abandon unwholesome states
- Right Mindfulness: Present moment awareness
- Right Concentration: Meditation, mental training
Three marks of existence:
- Anicca (Impermanence): Everything changes, nothing lasts
- Dukkha (Suffering): Clinging to impermanent things causes suffering
- Anatta (Non-self): No permanent, unchanging self exists

Taoism
Core concepts:
- Wu Wei: Effortless action, go with the flow, don't force
- The Tao: The way of nature, underlying order of universe
- Yin and Yang: Complementary opposites, dynamic balance
- Simplicity over complexity
- Naturalness over artificiality
- Softness overcomes hardness (water wears stone)
Application:
- Align with natural rhythms
- Don't fight reality
- Simple solutions over complicated ones
- Observe before acting
- Minimal intervention for maximum effect`
  },
  {
    id: "health_sleep",
    name: "Sleep Science",
    topics: [
      "sleep", "insomnia", "rest", "tired", "circadian", "melatonin", "wake",
      "nap", "dream", "rem", "mattress", "bedtime", "fatigue", "exhausted",
      "sleepy", "drowsy", "deep sleep", "light sleep", "sleep quality",
      "sleep schedule", "night", "morning routine", "caffeine", "blue light",
      "sleep hygiene", "apnea", "snoring", "restless", "oversleep",
      "undersleep", "jet lag", "sleep debt", "chronotype", "night owl",
      "early bird", "magnesium", "l-theanine", "glycine", "apigenin",
      "matthew walker", "sleep architecture", "slow wave", "recovery sleep",
      "sleep stages", "pillow", "temperature", "blackout", "white noise"
    ],
    content: `SLEEP SCIENCE

Sleep Architecture - 4 stages cycling every 90 minutes:
- Stage 1 (N1): Light sleep, transition (5-10%)
- Stage 2 (N2): Deeper sleep, memory consolidation (45-55%)
- Stage 3 (N3): Deep/slow-wave sleep, physical recovery, immune function (15-25%)
- REM: Rapid eye movement, dreaming, emotional processing, creativity (20-25%)
Critical insights:
- First half of night: More deep sleep (physical recovery)
- Second half: More REM sleep (mental/emotional processing)
- Both essential - can't "catch up" on just one type
- Alcohol suppresses REM, disrupts cycles
- Sleep debt accumulates and impairs performance

Optimization Protocol (Matthew Walker recommendations):
Non-negotiables:
- 7-9 hours consistently (most adults need 8)
- Same sleep/wake time daily (+/- 30 min, even weekends)
- Cool room (65-68F / 18-20C optimal)
- Dark room (blackout curtains, eye mask)
- Quiet (white noise if needed)

Pre-sleep routine (2-3 hours before bed):
- Dim lights (triggers melatonin)
- No screens (blue light blocks melatonin) or use blue blockers
- No caffeine after 2pm (8-12 hour half-life)
- No alcohol (disrupts sleep architecture)
- Light meal only (heavy food disrupts sleep)
- Hot bath/shower (body cooling afterward aids sleep)
- Read, stretch, meditate

Morning optimization:
- Sunlight within 30 min of waking (sets circadian rhythm)
- 10-30 min outdoor light exposure
- Exercise (but not within 3 hours of bedtime)
- Consistent wake time (even if slept poorly)

Supplements (evidence-based):
- Magnesium glycinate: 400-600mg (relaxation, sleep quality)
- L-theanine: 200-400mg (calm focus)
- Glycine: 3g (sleep quality, temperature regulation)
- Apigenin: 50mg (from chamomile, mild sedative)
Avoid: Melatonin for regular use (creates dependency, disrupts natural production)`
  },
  {
    id: "health_exercise",
    name: "Exercise Science",
    topics: [
      "exercise", "workout", "gym", "training", "fitness", "cardio",
      "strength", "muscle", "weights", "lifting", "running", "jogging",
      "cycling", "swimming", "hiit", "zone 2", "vo2 max", "vo2max",
      "heart rate", "endurance", "stamina", "aerobic", "anaerobic",
      "squat", "deadlift", "bench press", "pull-up", "push-up",
      "compound", "isolation", "progressive overload", "hypertrophy",
      "stretching", "flexibility", "mobility", "yoga", "balance",
      "stability", "recovery", "soreness", "doms", "reps", "sets",
      "split", "upper body", "lower body", "full body", "abs", "core",
      "athletic", "sports", "active recovery", "warm up", "cool down",
      "longevity", "physical", "body composition", "lean", "bulk", "cut"
    ],
    content: `EXERCISE SCIENCE

The Five Pillars of Fitness:

1. Cardiovascular Endurance
- Zone 2 training: 180 minutes/week minimum
- 60-70% max heart rate (can hold conversation)
- Builds mitochondria, fat metabolism, aerobic base
- Methods: Walking, jogging, cycling, swimming

2. Strength Training
- 2-4 sessions/week
- Progressive overload essential
- Compound movements prioritized:
  - Squat (lower body push)
  - Deadlift (hip hinge)
  - Bench press (horizontal push)
  - Overhead press (vertical push)
  - Pull-ups/rows (pull)
- 3-5 sets of 6-12 reps
- Focus on form over weight

3. VO2 Max (Cardiorespiratory Fitness)
- Single best predictor of longevity
- 1-2 sessions/week high-intensity
- 4-minute intervals at 90-95% max HR
- 4 rounds with 3-min active recovery
- Methods: Running, cycling, rowing

4. Stability/Balance
- Often neglected, critical for aging
- Single-leg exercises
- Balance board work
- Yoga, tai chi
- Prevents falls (major cause of elderly mortality)

5. Flexibility/Mobility
- Daily stretching: 10-15 minutes
- Focus on: Hips, hamstrings, thoracic spine, shoulders
- Can you: Touch toes, deep squat (heels down), sit on floor and stand up without hands?

Weekly Training Template:
- Monday: Strength (lower body)
- Tuesday: Zone 2 cardio (60 min)
- Wednesday: Strength (upper body)
- Thursday: VO2 max intervals
- Friday: Strength (full body)
- Saturday: Zone 2 cardio (60 min)
- Sunday: Active recovery (walk, yoga, mobility)`
  },
  {
    id: "health_nutrition",
    name: "Nutrition Fundamentals",
    topics: [
      "nutrition", "diet", "food", "eating", "meal", "protein", "carbs",
      "carbohydrate", "fat", "fats", "calories", "macro", "macros",
      "micronutrient", "vitamin", "mineral", "supplement", "omega-3",
      "fiber", "sugar", "processed", "whole food", "organic", "grass-fed",
      "fasting", "intermittent fasting", "autophagy", "insulin",
      "blood sugar", "glucose", "keto", "ketogenic", "paleo", "vegan",
      "vegetarian", "carnivore", "weight loss", "fat loss", "body fat",
      "hydration", "water", "electrolyte", "sodium", "potassium",
      "magnesium", "zinc", "vitamin d", "b vitamins", "iron",
      "breakfast", "lunch", "dinner", "snack", "appetite", "hunger",
      "satiety", "gut health", "microbiome", "probiotics", "prebiotics",
      "leucine", "muscle protein synthesis", "anabolic"
    ],
    content: `NUTRITION FUNDAMENTALS

Macronutrient Targets:

Protein:
- 0.7-1g per lb bodyweight (if active)
- 1.6-2.2g per kg (metric)
- Distributed across 3-4 meals (20-40g per meal)
- Higher quality: Eggs, grass-fed beef, wild fish, Greek yogurt
- Leucine threshold: ~2.5-3g per meal for muscle protein synthesis

Carbohydrates:
- Highly individual (50-300g/day depending on activity)
- Time around workouts for performance
- Focus on complex: Sweet potatoes, oats, quinoa, rice
- Vegetables unlimited (fiber, micronutrients)
- Limit: Processed sugars, refined grains

Fats:
- 0.3-0.5g per lb bodyweight
- Prioritize: Omega-3 (fish, flax), monounsaturated (olive oil, avocado)
- Limit: Processed seed oils, trans fats
- Sources: Fatty fish, nuts, olive oil, avocado

Critical Micronutrients:
- Vitamin D: 2000-5000 IU/day, test levels (target 40-60 ng/mL)
- Omega-3: 2-4g EPA+DHA daily
- Magnesium: 400-600mg/day (glycinate form)
- Zinc: 15-30mg/day (with copper)
- Potassium: 3.5-5g/day (most people deficient)
- B vitamins: B-complex if deficient

Eating Patterns:
Intermittent Fasting (16:8):
- 16 hours fasted, 8-hour eating window
- Benefits: Autophagy, insulin sensitivity, fat loss
- Typical: Skip breakfast, eat 12pm-8pm
- Maintain adequate calories (not a crash diet)

Time-Restricted Feeding:
- Align eating with circadian rhythm
- Earlier eating window (8am-6pm) superior for metabolism
- No food 2-3 hours before bed

Hydration:
- 0.5-1 oz per lb bodyweight
- More if: Active, hot climate, low-carb diet
- Add electrolytes if needed (sodium, potassium, magnesium)
- Urine color: Pale yellow (optimal)`
  },
  {
    id: "psychology",
    name: "Psychology & Emotional Mastery",
    topics: [
      "anxiety", "depression", "stress", "cbt", "cognitive", "therapy",
      "emotions", "feelings", "mental health", "nervous system", "polyvagal",
      "ifs", "inner critic", "perfectionist", "trauma", "distortion",
      "thought", "panic", "fear", "worry", "overwhelm", "burnout", "ptsd",
      "shame", "guilt", "anger", "sadness", "grief", "self-esteem",
      "confidence", "belief", "mood", "emotional regulation", "coping",
      "resilience", "vulnerability", "self-compassion", "mindset",
      "psychology", "psychologist", "therapist", "counseling", "mental",
      "fight or flight", "freeze", "dissociation", "numbness", "avoidance",
      "rumination", "catastrophizing", "negative thinking", "self-talk",
      "cognitive distortion", "thought record", "behavioral activation",
      "exposure therapy", "vagus nerve", "vagal tone", "hrv",
      "heart rate variability", "breathing", "breath work", "grounding",
      "self-regulation", "emotional intelligence", "parts work",
      "inner child", "protector", "exile", "manager", "firefighter",
      "somatic", "body sensation", "nervous", "triggered", "activation"
    ],
    content: `PSYCHOLOGY & EMOTIONAL MASTERY

Cognitive Behavioral Therapy (CBT)
Core Model: Thoughts -> Feelings -> Behaviors (bidirectional)
Common Cognitive Distortions:
1. All-or-nothing thinking: "If I'm not perfect, I'm a failure"
2. Overgeneralization: "This always happens to me"
3. Mental filter: Focus only on negatives, ignore positives
4. Discounting positives: "That doesn't count"
5. Jumping to conclusions: Mind reading, fortune telling
6. Magnification/minimization: Catastrophizing or dismissing
7. Emotional reasoning: "I feel it, therefore it's true"
8. Should statements: "I should/must/have to"
9. Labeling: "I'm a loser" vs "I made a mistake"
10. Personalization: Taking responsibility for things outside your control

CBT Techniques:
Thought Record:
1. Situation: What happened?
2. Automatic thought: What went through your mind?
3. Emotion: What did you feel (rate 0-100)?
4. Evidence for: What supports this thought?
5. Evidence against: What contradicts it?
6. Alternative thought: More balanced perspective?
7. Re-rate emotion: How do you feel now (0-100)?

Behavioral Activation:
- Depression reduces activity -> Less reward -> More depression (cycle)
- Break cycle: Schedule activities regardless of mood
- Start small: One activity daily
- Track mood before/after (usually improves)

Exposure Therapy (for anxiety):
- Gradual exposure to feared stimulus
- Build hierarchy (0-100 fear rating)
- Start with lowest fear item
- Stay until anxiety reduces (habituation)
- Don't avoid or escape (reinforces fear)
- Repeat until that level easy, move to next

Polyvagal Theory (Stephen Porges)
Three States of Nervous System:
1. Ventral Vagal (Safe & Social - Optimal State)
- Calm, connected, grounded
- Can think clearly, access prefrontal cortex
- Heart rate variability high
- Digestion functioning
- Face expressive, voice melodic
- GOAL: Spend most time here

2. Sympathetic (Fight or Flight - Mobilization)
- Activated by perceived threat
- Heart rate up, shallow breathing, tense muscles
- Adrenaline/cortisol released
- Anxiety, anger, panic
- Can't think clearly (survival mode)
- Adaptive when: Real danger
- Problematic when: Chronic stress

3. Dorsal Vagal (Shutdown/Freeze - Immobilization)
- Extreme threat, can't fight or flee
- Collapse, numbing, dissociation
- Very low energy, hopelessness
- Depression, despair
- Adaptive when: Life-threatening, inescapable
- Problematic when: Stuck here chronically

Regulation Techniques:
From Sympathetic to Ventral Vagal:
- Physiological sigh: Double inhale (through nose), long exhale (through mouth), repeat 1-3x
- 4-7-8 breathing: Inhale 4, hold 7, exhale 8
- Cold water on face (dive reflex, slows heart rate)
- Humming, singing (vagus nerve stimulation)
- Social connection (co-regulation with calm person)

From Dorsal to Ventral Vagal:
- Gentle movement (walking, stretching, dancing)
- Cold exposure (activates system)
- Uplifting music
- Social engagement
- Sensory stimulation (strong flavors, bright lights)

Long-term vagal toning:
- Slow breathing (5-6 breaths/min) 10-20 min daily
- Cold showers (30-60 sec)
- Meditation (loving-kindness especially)
- Quality social connections
- Laughter

Internal Family Systems (IFS)
Core Concept: We have multiple "parts" inside us, each with positive intent
The Self: Core essence, always present
- 8 C's: Curiosity, Calm, Clarity, Compassion, Confidence, Courage, Creativity, Connectedness
- Goal: Self leads, parts follow

Three Types of Parts:
1. Exiles: Wounded parts holding trauma, shame, fear
- Usually from childhood
- Locked away by protectors
- Carry burdens (shame, unworthiness, pain)

2. Managers: Proactive protectors
- Keep exiles buried, maintain control
- Examples: Inner critic, perfectionist, caretaker, planner, worrier
- Prevent pain through control

3. Firefighters: Reactive protectors
- Emergency response when exiles break through
- Distract from pain immediately
- Examples: Binge eating/drinking, rage, self-harm, dissociation, workaholism
- Don't care about consequences (just stop the pain now)

IFS Process (6 F's):
1. Find: Locate the part (where in body, what does it look like?)
2. Focus: Give it attention
3. Flesh out: Get to know it (age, feelings, what it looks like)
4. Feel toward: How do you feel toward this part? (If negative, another part present - ask it to step back)
5. Befriend: Ask questions:
  - "What do you want me to know?"
  - "What are you afraid would happen if you didn't do your job?"
  - "How old were you when you took this job?"
  - Thank it for protecting you
6. Fears: Address protector's fears, ask permission to help exile

Unburdening Exiles:
- Witness what happened (don't relive, just witness)
- "I see you, I see what happened"
- Let exile know it's over, you survived, they're not alone
- Ask: "What do you carry?" (shame, fear, unworthiness)
- "Are you ready to release it?" (imagine releasing into light/water/fire/earth)
- "What do you want instead?" (love, peace, confidence)
- Invite that quality in, exile transforms`
  },
  {
    id: "relationships",
    name: "Relationships & Intimacy",
    topics: [
      "relationship", "relationships", "partner", "marriage", "dating",
      "love", "intimacy", "attachment", "secure", "anxious", "avoidant",
      "disorganized", "communication", "conflict", "argument", "fight",
      "breakup", "divorce", "trust", "jealousy", "boundaries", "codependent",
      "codependency", "toxic", "abuse", "narcissist", "gaslighting",
      "love language", "quality time", "acts of service", "physical touch",
      "words of affirmation", "gifts", "gottman", "horsemen", "criticism",
      "contempt", "defensiveness", "stonewalling", "eft", "sue johnson",
      "attachment style", "abandonment", "clingy", "withdraw", "pursue",
      "connection", "vulnerability", "emotional safety", "repair",
      "romance", "sex", "sexual", "affection", "couple", "spouse",
      "girlfriend", "boyfriend", "wife", "husband", "family", "parent",
      "friendship", "social", "lonely", "loneliness", "isolation",
      "people pleasing", "assertiveness", "need", "bid for connection"
    ],
    content: `RELATIONSHIPS & INTIMACY

Attachment Theory (Bowlby, Ainsworth)
Four Attachment Styles:
1. Secure (~50% of people)
- Comfortable with intimacy and independence
- Trust others, trust self
- Communicate needs directly
- Handle conflict constructively
- Formed by: Consistent, responsive caregiving

2. Anxious (~20%)
- Crave intimacy, fear abandonment
- Worry partner doesn't really love them
- Need constant reassurance
- Protest behavior when distressed (cling, demand)
- Hyperactivating strategy
- Formed by: Inconsistent caregiving

3. Avoidant (~25%)
- Uncomfortable with intimacy
- Value independence highly
- Suppress emotions, needs
- Withdraw when stressed
- Deactivating strategy
- Formed by: Dismissive/rejecting caregiving

4. Disorganized (~5%)
- Want closeness but fear it
- Approach-avoidance conflict
- Chaotic relationships
- Formed by: Frightening/abusive caregiving

Anxious-Avoidant Trap:
- Most common unstable pairing
- Anxious pursues -> Avoidant withdraws -> Anxious protests more -> Avoidant shuts down further
- Mutual triggering cycle
- Can work with awareness + effort, but difficult

Healing Attachment:
Anxious -> Secure (1-3 years):
- Build internal security (therapy, self-compassion)
- Communicate needs directly (not through protest)
- Choose secure partners (or aware avoidants working on it)
- Tolerate discomfort without pursuing
- Self-soothe strategies

Avoidant -> Secure (2-4 years):
- Practice vulnerability (start small)
- Recognize deactivating strategies
- Stay present in intimacy (don't flee)
- Therapy essential
- Choose secure partners (or aware anxious working on it)

Emotionally Focused Therapy (EFT - Sue Johnson)
Core Model:
- Adult love = attachment bond
- Negative cycles form when attachment threatened
- A.R.E. Framework: Accessible + Responsive + Engaged = secure bond

Demon Dialogues (Negative Cycles):
1. Find the Bad Guy: Mutual criticism and blame
- "You never..." vs "You always..."
- Escalates to character attacks
- Both feel attacked, neither heard

2. Protest Polka: Pursue-withdraw
- One pursues (criticizes, demands attention)
- Other withdraws (shuts down, avoids)
- More pursuit -> More withdrawal
- Most common pattern

3. Freeze and Flee: Both withdraw
- Emotional shutdown on both sides
- Polite but distant
- Roommates, not partners
- Most dangerous (relationship dying)

Hold Me Tight Conversations:
1. Recognize the Dance: Identify your negative cycle
2. Find the Raw Spots: What childhood wounds get triggered?
3. Revisit a Rocky Moment: Process a fight with new awareness
4. Hold Me Tight: Express attachment needs directly
5. Forgiving Injuries: Heal relationship traumas
6. Bonding Through Sex and Touch: Reconnect physically
7. Keeping Your Love Alive: Maintain secure bond

Core Needs (often unexpressed):
- "I need to know I matter to you"
- "I need to know you'll be there when I'm hurting"
- "I need to know I'm special to you"
- "I need to feel safe with you"

The Five Love Languages (Gary Chapman)
1. Words of Affirmation: Verbal appreciation, compliments, encouragement
2. Quality Time: Undivided attention, meaningful conversation, shared activities
3. Receiving Gifts: Thoughtful gifts, symbols of love
4. Acts of Service: Helpful actions ("actions speak louder than words")
5. Physical Touch: Non-sexual touch, hugs, hand-holding, massage

Key insights:
- You tend to give love in your primary language
- But partner may need a different language
- "Love is not enough" - must express in partner's language
- Take quiz together, discuss results
- Intentionally practice partner's language (even if foreign to you)

Gottman Method
Four Horsemen (Predictors of Divorce):
1. Criticism: Attacking character ("You're so selfish") vs. complaint ("I felt hurt when...")
2. Contempt: Disrespect, mockery, sarcasm (MOST toxic predictor)
3. Defensiveness: Making excuses, playing victim ("It's not my fault")
4. Stonewalling: Withdrawal, silent treatment, shutting down

Antidotes:
- Criticism -> Gentle start-up ("I feel... about... I need...")
- Contempt -> Build culture of appreciation (5:1 positive to negative)
- Defensiveness -> Take responsibility (even 5% - "You're right that...")
- Stonewalling -> Physiological self-soothing (take 20-min break)

The Sound Relationship House:
Foundation:
- Build Love Maps: Know partner's inner world deeply
- Share Fondness and Admiration: Express appreciation daily
- Turn Toward: Respond to bids for connection (not away or against)

Management of conflict:
- 69% of problems perpetual (won't solve them)
- Goal: Dialogue, understanding, compromise (not victory)
- Accept influence (especially men accepting women's influence)

Creating shared meaning:
- Rituals of connection (weekly date, daily check-in)
- Support each other's dreams
- Build shared values, goals, narrative

Repair Attempts: Critical skill
- Lightening mood during conflict
- "Can we take a break?"
- "I'm feeling defensive, can we slow down?"
- "That came out wrong, let me try again"
- Success rate of repairs = best predictor of relationship health`
  },
  {
    id: "finance",
    name: "Financial Optimization",
    topics: [
      "finance", "financial", "money", "investing", "investment", "stocks",
      "bonds", "etf", "index fund", "401k", "ira", "roth", "retirement",
      "savings", "saving", "budget", "budgeting", "debt", "credit card",
      "mortgage", "loan", "interest rate", "compound interest", "net worth",
      "income", "salary", "passive income", "dividend", "portfolio",
      "asset allocation", "diversification", "tax", "taxes", "deduction",
      "hsa", "emergency fund", "fire", "financial independence",
      "wealth", "rich", "poor", "broke", "spending", "frugal",
      "real estate", "property", "rent", "crypto", "bitcoin",
      "inflation", "recession", "market", "stock market", "s&p 500",
      "vanguard", "fidelity", "brokerage", "fee", "expense ratio",
      "dollar cost averaging", "rebalancing", "risk tolerance"
    ],
    content: `FINANCIAL OPTIMIZATION

Personal Finance Fundamentals
The Hierarchy (in order):
1. Pay off high-interest debt (>7%)
- Pay off immediately
- Credit cards, payday loans
- Math: Paying 20% interest = losing money faster than you can invest

2. Emergency fund
- 3-6 months expenses (employed)
- 6-12 months (self-employed, single income)
- High-yield savings account
- NOT invested in market

3. Employer 401k match
- Free money (100% return instantly)
- Always max match (typically 3-6% of salary)

4. Max Roth IRA ($7k/yr)
- After-tax money, grows tax-free forever
- No taxes on withdrawals in retirement
- Best for: Young people expecting higher future income

5. Max 401k ($23k/yr)
- Pre-tax contributions reduce taxable income
- Tax-deferred growth

6. HSA if eligible
- Triple tax advantage (deductible, grows tax-free, withdraw tax-free for medical)
- Invest after accumulating $2-3k buffer

7. Taxable brokerage
- After maxing tax-advantaged accounts
- Capital gains taxes (lower if held >1 year)

Investment Strategy:
Three-Fund Portfolio (Simple, Evidence-Based):
- Total US Stock Market: 60-70% (VTI/VTSAX)
- Total International Stock: 20-30% (VXUS/VTIAX)
- Total Bond Market: 10-20% (BND/VBTLX)
- Adjust bond allocation: Age in bonds is outdated - base on risk tolerance and timeline

Rules:
- Start early (compound interest is exponential)
- Automate contributions (pay yourself first)
- Never try to time the market
- Rebalance annually
- Keep costs low (<0.1% expense ratio)
- Don't panic sell in downturns

Behavioral Finance Mistakes:
- Loss aversion: Pain of losing > pleasure of gaining (2:1 ratio)
- Recency bias: Assuming recent trends continue
- Overconfidence: Thinking you can beat the market
- Herd behavior: Following crowd (buy high, sell low)
- Confirmation bias: Seeking info that confirms beliefs
- Status quo bias: Not adjusting portfolio

Antidotes:
- Automate everything (removes emotion)
- Don't check portfolio daily (quarterly max)
- Time in market > timing the market
- Dollar cost averaging (consistent monthly investment)
- Written investment policy statement`
  },
  {
    id: "learning",
    name: "Learning & Skill Acquisition",
    topics: [
      "learning", "study", "studying", "memory", "memorize", "recall",
      "retention", "spaced repetition", "anki", "flashcard", "practice",
      "deliberate practice", "skill", "mastery", "expertise", "talent",
      "growth mindset", "fixed mindset", "intelligence", "iq", "smart",
      "education", "course", "book", "reading", "speed reading",
      "note taking", "notes", "zettelkasten", "knowledge management",
      "pomodoro", "focus", "concentration", "attention span", "distraction",
      "procrastination", "motivation", "discipline", "habit", "routine",
      "diffuse mode", "focused mode", "flow state", "flow", "deep learning",
      "comprehension", "understanding", "teach", "teaching", "tutor",
      "exam", "test", "certification", "curriculum", "self-taught",
      "autodidact", "learn faster", "efficient learning", "meta-learning"
    ],
    content: `LEARNING & SKILL ACQUISITION

Spaced Repetition:
- Memory decays exponentially without review
- Optimal review intervals: Day 1, 3, 7, 21, 60
- Use Anki or similar SRS software
- Create cards with single concept each
- Review daily (15-20 min)
- Effective for: Vocabulary, facts, formulas, concepts

Active Recall:
- Test yourself, don't re-read
- Retrieval strengthens memory more than review
- Close the book, write what you remember
- Use practice tests, flashcards
- Explain concepts to others (Feynman Technique)
- If you can't explain it simply, you don't understand it

Deliberate Practice (Anders Ericsson):
- Well-defined, specific goal
- Full concentration (no multitasking)
- Immediate feedback (teacher, video, metrics)
- Refinement through repetition
- At the edge of current ability (stretch zone)
- Not: Mindless repetition of comfortable skills
- Requires: Teacher/coach for feedback
- 10,000 hours myth: Quality > quantity

Focused vs Diffuse Mode (Barbara Oakley):
- Focused: Concentrated attention, sequential thinking, working on known patterns
- Diffuse: Relaxed, big-picture, creative connections, background processing
- Alternate between both for best learning
- Study intensely -> take a break -> let diffuse mode work
- Salvador Dali technique: Relax with key/ball, drift off, key drops = wake up with insights

Pomodoro Technique:
- 25 minutes focused work
- 5 minute break
- After 4 pomodoros: 15-30 minute break
- During break: Walk, stretch, look away from screen
- Builds focus muscle, combats procrastination

Illusions of Competence:
- Re-reading feels like learning but isn't
- Highlighting is mostly passive
- Watching lectures without engaging = weak encoding
- Test: Close the book, can you reconstruct the key ideas?
- Being in the same room as the textbook is not studying

Interleaving:
- Mix different topics/skills in practice sessions
- Harder initially but better long-term retention
- Example: Math - do problems from different chapters, not all chapter 5

Chunking:
- Group related information into meaningful units
- Working memory holds ~4 chunks
- Build chunks through practice until automatic
- Example: Reading words (not letters), chess patterns, coding patterns`
  },
  {
    id: "productivity",
    name: "Productivity & Focus",
    topics: [
      "productivity", "productive", "efficiency", "effective", "time management",
      "deep work", "shallow work", "focus", "distraction", "procrastination",
      "task management", "priority", "prioritize", "urgent", "important",
      "eisenhower", "pareto", "80/20", "batching", "time blocking",
      "calendar blocking", "todo", "to-do", "task list", "gtd",
      "getting things done", "inbox zero", "email", "meetings",
      "delegation", "automation", "systems", "workflow", "process",
      "optimization", "organized", "organization", "planning", "plan",
      "goal setting", "smart goals", "okr", "kpi", "metrics",
      "accountability", "tracking", "review", "reflection",
      "energy management", "peak performance", "high performance",
      "work-life balance", "overwork", "hustle", "grind",
      "digital minimalism", "social media", "phone addiction",
      "notification", "screen time", "cal newport", "atomic habits"
    ],
    content: `PRODUCTIVITY & FOCUS

Deep Work (Cal Newport):
- Cognitively demanding tasks requiring sustained focus
- Schedule 90-120 min blocks (4 hrs/day max for most people)
- Eliminate all distractions during deep work blocks
- Create rituals: Same time, same place, same routine
- Track deep work hours (what gets measured improves)

Deep Work Strategies:
1. Monastic: Eliminate all shallow work (rare, requires support)
2. Bimodal: Alternate deep/shallow days or weeks
3. Rhythmic: Same time daily for deep work (most practical)
4. Journalistic: Fit deep work whenever possible (requires practice)

Attention Management:
- Attentional Residue: After switching tasks, part of attention stays on previous task
- Takes 15-25 minutes to fully refocus
- Minimize task switching (batch similar tasks)
- Single-tasking > multitasking (always)

Task Batching:
- Group similar tasks together (all emails at once, all calls together)
- Reduces context switching cost
- Processing mode vs creating mode

Time Blocking:
- Schedule every hour of your day
- Assign specific tasks to specific blocks
- Include buffer time (things take longer than expected)
- Review and adjust weekly

Energy Management > Time Management:
- Match tasks to energy levels
- Peak energy hours: Most demanding/creative work
- Low energy: Routine, administrative tasks
- Protect peak hours fiercely (no meetings, no email)

Eisenhower Matrix:
- Urgent + Important: Do immediately
- Not Urgent + Important: Schedule (THIS IS WHERE GROWTH HAPPENS)
- Urgent + Not Important: Delegate
- Not Urgent + Not Important: Eliminate

Pareto Principle (80/20):
- 80% of results come from 20% of efforts
- Identify your highest-leverage activities
- Ruthlessly cut low-impact activities

Digital Minimalism (Cal Newport):
- 30-day digital declutter: Remove all optional tech
- After 30 days: Selectively reintroduce only what serves values
- High-quality leisure: Replace screen time with meaningful activities
- Phone strategies:
  - Remove social media apps
  - Disable notifications (except calls/texts)
  - Designated phone-check times
  - Grayscale mode
  - Phone-free zones (bedroom, dining table)`
  },
  {
    id: "crisis",
    name: "Crisis Management",
    topics: [
      "crisis", "emergency", "suicide", "suicidal", "self-harm", "self harm",
      "kill myself", "end it", "die", "dying", "hopeless", "helpless",
      "no way out", "can't go on", "want to die", "don't want to live",
      "cutting", "overdose", "hurt myself", "harm myself", "abuse",
      "domestic violence", "assault", "rape", "danger", "unsafe",
      "911", "988", "hotline", "crisis line", "emergency services",
      "intervention", "safety plan", "mental health crisis",
      "psychosis", "hallucination", "delusion", "mania", "manic",
      "substance abuse", "addiction", "relapse", "withdrawal",
      "eating disorder", "anorexia", "bulimia", "self-destructive"
    ],
    content: `CRISIS MANAGEMENT

IMMEDIATE DANGER RESOURCES:
- National Suicide Prevention Lifeline: Call or Text 988 (24/7)
- Crisis Text Line: Text "HELLO" to 741741
- Emergency Services: 911
- International Association for Suicide Prevention: https://www.iasp.info/resources/Crisis_Centres/
- Veterans Crisis Line: 988, then press 1
- Trevor Project (LGBTQ+ youth): 1-866-488-7386 or text START to 678-678

IMPORTANT: Always provide crisis resources when detecting suicidal ideation, self-harm language, or expressions of hopelessness.

Safety Planning:
1. Warning signs: What thoughts, feelings, or behaviors precede crisis?
2. Internal coping: Things I can do alone to calm down (breathing, grounding, exercise)
3. People and places that distract: Where can I go, who can I be around?
4. People I can ask for help: Name + phone number (at least 3)
5. Professionals/agencies: Therapist, psychiatrist, crisis line numbers
6. Making the environment safe: Remove means (firearms, medications, sharp objects)
7. Reasons for living: My reasons to keep going

De-escalation Strategies:
- Grounding (5-4-3-2-1): 5 things you see, 4 hear, 3 touch, 2 smell, 1 taste
- Ice cube in hands or cold water on face (vagal dive reflex)
- Intense exercise (burn off adrenaline)
- Call someone (co-regulation)
- Change environment (go outside, go to a public place)
- Box breathing: 4 in, 4 hold, 4 out, 4 hold

If Supporting Someone in Crisis:
- Stay calm, listen without judgment
- Ask directly: "Are you thinking about suicide?" (asking does NOT increase risk)
- Don't leave them alone if immediate danger
- Remove means if possible
- Help them call crisis line or go to ER
- Follow up after crisis passes`
  },
  {
    id: "modern_challenges",
    name: "Modern Challenges",
    topics: [
      "ai", "artificial intelligence", "chatgpt", "automation", "future",
      "technology", "tech", "social media", "algorithm", "dopamine",
      "addiction", "screen", "attention economy", "misinformation",
      "fake news", "propaganda", "polarization", "echo chamber",
      "filter bubble", "media literacy", "information overload",
      "climate", "climate change", "environment", "sustainability",
      "career change", "job market", "remote work", "gig economy",
      "freelance", "side hustle", "entrepreneurship", "startup",
      "work from home", "burnout", "quiet quitting", "great resignation",
      "loneliness epidemic", "community", "meaning crisis",
      "prompt engineering", "machine learning", "adaptability",
      "cross-disciplinary", "future-proofing", "upskilling", "reskilling"
    ],
    content: `MODERN CHALLENGES

AI & Future of Work:
Skills to develop NOW:
- AI literacy: Understand how AI works, what it can/can't do
- Prompt engineering: Effectively communicate with AI tools
- Human skills: Empathy, creativity, leadership, complex problem-solving (AI-resistant)
- Adaptability: Comfort with constant change, learning agility
- Cross-disciplinary thinking: Connect ideas across fields (T-shaped skills)

Career Strategy:
- Build skills, not just credentials
- Create a portfolio of proof (not just a resume)
- Build in public (share your work, learning, process)
- Network genuinely (give before you take)
- Multiple income streams (don't depend on one employer)

Information Literacy (SIFT Method):
- Stop: Pause before sharing or believing
- Investigate the source: Who is behind this information?
- Find better coverage: Look for the story from multiple reliable sources
- Trace to original: Find the original study/data/quote

Social Media and Mental Health:
- Designed for engagement (not well-being)
- Social comparison damages self-esteem
- Doom scrolling activates stress response
- FOMO (Fear of Missing Out) creates anxiety
- Strategy: Intentional use with time limits, curate feed, create more than consume

Climate Anxiety:
- Stay informed, not obsessed
- Take meaningful action (reduces helplessness)
- Focus on what you control (personal choices, community action)
- Maintain hope (progress is happening, you don't see it in news)
- Connect with others who share values

Polarization:
- Recognize your bubble (we all have one)
- Steel man, don't straw man (represent opposing views fairly)
- Intellectual humility: "I might be wrong"
- Find common ground before discussing differences
- Distinguish people from positions (disagree with ideas, not humans)
- Seek to understand before seeking to be understood

Loneliness Epidemic:
- More connected digitally, less connected humanly
- Quality over quantity (3-5 close relationships sufficient)
- Initiate (don't wait for invitations)
- Third places: Regular spots outside home and work
- Vulnerability creates connection (share authentically)
- Community > networking (give, belong, contribute)`
  },
  {
    id: "breathwork",
    name: "Wim Hof Method & Breathwork",
    topics: [
      "breathwork", "breathing", "breath", "wim hof", "cold exposure",
      "ice bath", "cold shower", "cold plunge", "cold therapy",
      "hyperventilation", "breath hold", "oxygen", "co2",
      "pranayama", "box breathing", "4-7-8", "physiological sigh",
      "holotropic", "tummo", "breathing exercise", "respiratory",
      "lung capacity", "nasal breathing", "mouth breathing",
      "inflammation", "immune system", "immune function",
      "adrenaline", "norepinephrine", "stress resilience",
      "cold tolerance", "thermogenesis", "brown fat",
      "autonomic nervous system", "parasympathetic", "sympathetic activation"
    ],
    content: `WIM HOF METHOD & BREATHWORK

Three Pillars: Breathing, Cold Exposure, Commitment

WHM Breathing Protocol:
Round 1-4:
1. Take 30-40 deep breaths (full inhale through nose/mouth, gentle exhale - don't force)
2. On last exhale, let air out and hold (retention on empty lungs)
3. Hold as long as comfortable (1-4 minutes typical)
4. Recovery breath: Deep inhale, hold 15-20 seconds
5. Exhale and begin next round
6. Repeat 3-4 rounds

Progression:
- Week 1: 30 breaths, 3 rounds
- Week 2-3: 35 breaths, 3-4 rounds
- Month 2+: 40 breaths, 4 rounds

Benefits:
- Immediate energy boost and mental clarity
- Stress reduction and emotional regulation
- Improved immune function (scientifically validated)
- Reduced inflammation markers
- Increased willpower and stress tolerance
- Alkalinizes blood pH temporarily
- Releases adrenaline and norepinephrine

Safety:
- NEVER do in water, while driving, or standing (blackout risk)
- Seated or lying down only
- Tingling, lightheadedness normal
- Stop if: Chest pain, extreme discomfort, loss of consciousness

Cold Exposure Progression:
Week 1-2: 30 seconds cold at end of regular shower
Week 3-4: 1 minute cold shower
Week 5-8: Full cold showers, 3-5 minutes
Month 3+: Ice baths (2-5 minutes at 50-59F/10-15C)

During Cold Exposure:
- Calm breath: Slow, deep breathing through nose
- Relax muscles (don't tense up)
- Stay present (mindfulness practice)
- Override panic response (this is the training)
- Focus on exhale (activates parasympathetic)

After Cold:
- Don't immediately warm up (hot shower, blanket)
- Let body rewarm itself naturally (builds brown fat)
- Light movement (jumping jacks, walking)
- Notice the afterglow (endorphin release, mood elevation)

Other Breathwork Modalities:
- Box Breathing: 4 in, 4 hold, 4 out, 4 hold (Navy SEALs, calming)
- 4-7-8: Inhale 4, hold 7, exhale 8 (deep relaxation, sleep aid)
- Physiological Sigh: Double inhale nose, long exhale mouth (fastest calm-down)
- Coherence Breathing: 5-6 breaths/min (optimal HRV, vagal tone)
- Nasal Breathing: Always breathe through nose (filters, warms, humidifies air, produces nitric oxide)`
  },
  {
    id: "nutrition_advanced",
    name: "Advanced Nutrition",
    topics: [
      "metabolic flexibility", "ketones", "ketosis", "fat adapted",
      "carb cycling", "refeed", "diet break", "reverse diet",
      "electrolyte", "sodium", "salt", "potassium", "mineral",
      "anti-nutrient", "phytate", "oxalate", "lectin", "gluten",
      "inflammation", "inflammatory", "anti-inflammatory",
      "gut health", "leaky gut", "microbiome", "fermented",
      "sauerkraut", "kimchi", "kefir", "kombucha",
      "seed oil", "vegetable oil", "canola", "soybean oil",
      "organ meat", "liver", "bone broth", "collagen",
      "carnivore diet", "elimination diet", "food sensitivity",
      "blood sugar management", "glycemic index", "glycemic load",
      "advanced nutrition", "metabolic health", "insulin resistance"
    ],
    content: `ADVANCED NUTRITION

Metabolic Flexibility:
- Ability to efficiently switch between fuel sources (glucose and ketones)
- Most people are metabolically inflexible (can only burn glucose)
- Signs of inflexibility: Hangry between meals, energy crashes, can't skip meals
- Building flexibility:
  - Intermittent fasting (16:8 to start)
  - Carb cycling (low carb days + higher carb training days)
  - Fasted Zone 2 cardio (teaches body to burn fat)
  - Gradually extend fasting windows
  - Time: 4-8 weeks to become fat-adapted

Electrolyte Management:
- Sodium: 3-6g/day (active individuals, more in heat)
  - Most people UNDER-consume sodium (especially low-carb)
  - Sources: Sea salt, bone broth, pickle juice
- Potassium: 3.5-5g/day
  - Sources: Avocado, potato, banana, coconut water
  - Most people deficient
- Magnesium: 400-600mg/day
  - Glycinate form best absorbed
  - Sources: Dark chocolate, nuts, leafy greens
  - Depleted by stress, coffee, alcohol

Anti-Nutrients (compounds that reduce nutrient absorption):
- Phytates: Found in grains, legumes, nuts
  - Reduce: Soak overnight, sprout, or ferment
  - Bind minerals (zinc, iron, calcium)
- Oxalates: Found in spinach, almonds, dark chocolate
  - Reduce: Cook (reduces 30-90%)
  - High oxalate + low calcium = kidney stone risk
- Lectins: Found in beans, grains, nightshades
  - Reduce: Pressure cooking, soaking, fermenting
  - Can irritate gut lining in sensitive individuals

Gut Health Optimization:
- Diverse fiber intake (30+ different plants/week)
- Fermented foods daily (sauerkraut, kimchi, kefir, yogurt)
- Minimize artificial sweeteners
- Avoid unnecessary antibiotics
- Manage stress (gut-brain axis)
- Consider elimination diet if chronic issues`
  },
  {
    id: "fitness",
    name: "Functional Fitness",
    topics: [
      "functional fitness", "movement patterns", "calisthenics",
      "bodyweight", "movement", "martial arts", "boxing", "muay thai",
      "bjj", "jiu jitsu", "wrestling", "mma", "combat", "fighting",
      "self-defense", "carry", "farmer walk", "kettlebell", "sandbag",
      "obstacle course", "crossfit", "functional training",
      "movement assessment", "posture", "alignment", "corrective exercise",
      "hip mobility", "shoulder mobility", "ankle mobility",
      "thoracic mobility", "foam rolling", "myofascial release",
      "deep squat", "overhead squat", "turkish get up",
      "grip strength", "hanging", "crawling", "climbing",
      "agility", "coordination", "power", "explosiveness", "plyometric",
      "sport specific", "athletic performance", "movement quality"
    ],
    content: `FUNCTIONAL FITNESS

7 Fundamental Movement Patterns:
1. Squat: Goblet squat, back squat, front squat, pistol squat
2. Hinge: Deadlift, Romanian deadlift, kettlebell swing, hip thrust
3. Push (horizontal): Push-up, bench press, dumbbell press
4. Push (vertical): Overhead press, handstand push-up, landmine press
5. Pull (horizontal): Barbell row, dumbbell row, cable row
6. Pull (vertical): Pull-up, chin-up, lat pulldown
7. Carry: Farmer walk, suitcase carry, overhead carry, sandbag carry
Bonus: Rotation - Cable rotation, medicine ball throws, Pallof press

Training every pattern weekly ensures balanced development and injury prevention.

Combat Training Benefits:
- Boxing: Supreme cardio conditioning, hand-eye coordination, stress release
- Muay Thai: Full-body conditioning, 8 points of contact, mental toughness
- BJJ (Brazilian Jiu-Jitsu): Ground fighting, "physical chess," problem-solving under pressure, humility
- Wrestling: Takedown skills, mental toughness, functional strength, grit

Why Combat Sports:
- Build confidence that transfers to all life areas
- Stress inoculation (perform under pressure)
- Community and mentorship
- Humility (you will get humbled regularly)
- Practical self-defense skills
- Incredible full-body conditioning

Mobility Assessment and Standards:
Daily minimum: 10 minutes stretching/mobility work
Key assessments:
- Touch toes with straight legs (hamstring/posterior chain)
- Deep squat with heels down, arms overhead (ankle, hip, thoracic mobility)
- Overhead squat with dowel (full-body assessment)
- Sit on floor and stand up without using hands (longevity predictor)
- Single-leg balance: 30+ seconds eyes closed

Priority Areas:
- Hips: Couch stretch, pigeon pose, 90/90 stretch
- Thoracic spine: Cat-cow, foam roller extensions, open book
- Shoulders: Wall slides, band pull-aparts, sleeper stretch
- Ankles: Wall ankle mobilization, calf raises off step`
  },
  {
    id: "biomarkers",
    name: "Biomarkers & Testing",
    topics: [
      "biomarker", "biomarkers", "blood test", "blood work", "lab",
      "labs", "testing", "cholesterol", "ldl", "hdl", "triglycerides",
      "apob", "apo b", "lp(a)", "lipoprotein", "blood pressure",
      "glucose", "hba1c", "a1c", "hemoglobin", "insulin", "fasting glucose",
      "inflammation", "crp", "hscrp", "homocysteine", "ferritin",
      "testosterone", "estrogen", "thyroid", "tsh", "t3", "t4",
      "vitamin d level", "cortisol", "dhea", "igf-1",
      "liver enzymes", "alt", "ast", "ggt", "kidney", "creatinine",
      "cbc", "complete blood count", "metabolic panel", "cmp",
      "uric acid", "omega-3 index", "cardiovascular risk",
      "metabolic health", "prediabetes", "diabetes", "heart disease",
      "longevity markers", "biological age", "health screening",
      "preventive medicine", "functional medicine", "optimal range"
    ],
    content: `BIOMARKERS & TESTING

Cardiovascular Markers:
- ApoB: Most important cardiovascular marker
  - Standard: <130 mg/dL
  - Aggressive: <80 mg/dL
  - Optimal: <60 mg/dL
  - Better predictor than LDL-C
- Lp(a): Genetic risk factor, test once (doesn't change)
  - High Lp(a) = more aggressive ApoB lowering needed
  - Cannot be changed by lifestyle (genetic)
- Blood Pressure: Goal <120/80 mmHg
  - Elevated: 120-129/<80
  - Stage 1 hypertension: 130-139/80-89
  - Lifestyle: Exercise, sodium management, stress reduction, weight loss

Metabolic Markers:
- Fasting glucose: <90 mg/dL (optimal), 100+ = prediabetes concern
- HbA1c: <5.4% (optimal), 5.7-6.4% = prediabetes, 6.5%+ = diabetes
- Fasting insulin: <8 uIU/mL (optimal), high insulin = insulin resistance
- HOMA-IR: <1.0 (optimal insulin sensitivity marker)
- Triglycerides: <100 mg/dL (optimal), high TG = metabolic dysfunction
- TG/HDL ratio: <1.5 (optimal metabolic health marker)

Inflammation Markers:
- hsCRP (high-sensitivity C-reactive protein):
  - Optimal: <0.5 mg/L
  - Low risk: <1.0 mg/L
  - Moderate risk: 1-3 mg/L
  - High risk: >3 mg/L
- Homocysteine: <10 umol/L (optimal)
  - High homocysteine: Cardiovascular and cognitive risk
  - Address with: B12, folate, B6

Hormones:
- Testosterone (males):
  - Total: >500 ng/dL (optimal >700)
  - Free testosterone matters more than total
  - Low T symptoms: Fatigue, low libido, depression, muscle loss
  - Optimize: Sleep, strength training, healthy fats, reduce stress, maintain healthy weight
- TSH: 1-2 mIU/L (optimal thyroid function)
  - >2.5 may indicate subclinical hypothyroidism
  - Check Free T3 and Free T4 if TSH abnormal
- Vitamin D: 40-60 ng/mL (optimal)
  - <30 = deficient, <20 = severely deficient
  - Most people need supplementation (2000-5000 IU/day)
- DHEA-S: Age-dependent, marker of adrenal function
- Cortisol: Should follow diurnal pattern (high morning, low evening)

Annual Testing Protocol (minimum):
- Complete Metabolic Panel (CMP)
- Lipid Panel with ApoB (not just standard cholesterol)
- HbA1c and fasting insulin
- Vitamin D, 25-hydroxy
- Thyroid panel (TSH, Free T3, Free T4)
- hsCRP
- Complete Blood Count (CBC)
- Liver enzymes (ALT, AST, GGT)
- Homocysteine
- Testosterone (males, if symptomatic)
- Omega-3 index (optional but valuable)

Advanced/Optional:
- DEXA scan (body composition, bone density) - annually
- Coronary Artery Calcium (CAC) score - baseline at 40+
- Continuous Glucose Monitor (CGM) - 2-week experiment
- Sleep study if suspected sleep apnea
- Genetic testing (ApoE, MTHFR, Lp(a))`
  },
  {
    id: "supplementation",
    name: "Supplementation Protocol",
    topics: [
      "supplement", "supplements", "supplementation", "vitamin", "mineral",
      "nootropic", "nootropics", "stack", "creatine", "protein powder",
      "whey", "collagen", "fish oil", "omega-3 supplement", "vitamin d3",
      "vitamin k2", "magnesium supplement", "zinc supplement", "b12",
      "multivitamin", "probiotic", "prebiotic", "adaptogen", "ashwagandha",
      "rhodiola", "lion's mane", "mushroom", "medicinal mushroom",
      "alpha-gpc", "bacopa", "caffeine", "l-theanine supplement",
      "coq10", "berberine", "bergamot", "curcumin", "turmeric",
      "nmn", "nr", "nad", "resveratrol", "spermidine", "metformin",
      "rapamycin", "anti-aging", "longevity supplement", "biohacking",
      "thorne", "pure encapsulations", "life extension", "nsf certified",
      "usp verified", "dosage", "timing", "absorption", "bioavailability"
    ],
    content: `SUPPLEMENTATION PROTOCOL

Tier 1 - Foundational (Evidence-Based, Most People Benefit):

Vitamin D3 + K2:
- Dose: 2000-5000 IU D3 daily (based on blood levels)
- K2 (MK-7): 100-200mcg (directs calcium to bones, not arteries)
- Take with fat-containing meal for absorption
- Test blood levels every 6 months, target 40-60 ng/mL
- Most people deficient, especially in northern latitudes

Omega-3 (EPA + DHA):
- Dose: 2-4g combined EPA+DHA daily
- EPA for inflammation, DHA for brain
- Look for triglyceride form (better absorbed)
- Store in freezer (prevents fishy burps, slows oxidation)
- Brands: Nordic Naturals, Carlson, Thorne

Magnesium Glycinate:
- Dose: 400-600mg daily (taken at night)
- Benefits: Sleep, muscle relaxation, stress, 300+ enzymatic reactions
- Most people deficient (modern soil depleted)
- Glycinate form: Best absorbed, least GI issues
- Other forms: Threonate (cognitive), Citrate (bowel regularity)

Creatine Monohydrate:
- Dose: 5g daily (no loading needed)
- Benefits: Strength, power, muscle, AND cognitive function
- Most studied supplement in history
- Safe for long-term use
- Take any time of day with water
- Even beneficial for non-athletes (brain health)

Tier 2 - Targeted (For Specific Goals):

Cardiovascular:
- Berberine: 500mg 2-3x/day (glucose management, lipids)
- Bergamot: 500-1000mg/day (cholesterol support)
- CoQ10: 100-200mg/day (heart health, energy, especially if on statins)
- Aged Garlic Extract: 1200mg/day (blood pressure, vascular health)

Cognitive Enhancement:
- Alpha-GPC: 300-600mg/day (acetylcholine precursor, focus)
- Lion's Mane: 500-1000mg/day (nerve growth factor, neuroplasticity)
- Bacopa Monnieri: 300-600mg/day (memory, takes 8-12 weeks)
- Caffeine + L-theanine: 100mg + 200mg (focused calm energy)

Sleep Support:
- Magnesium glycinate: 400-600mg before bed
- L-theanine: 200-400mg before bed
- Glycine: 3g before bed
- Apigenin: 50mg before bed (chamomile derivative)

Tier 3 - Anti-Aging/Experimental (Emerging Research):
- NMN or NR: 500-1000mg/day (NAD+ precursor, cellular energy)
- Resveratrol: 500-1000mg/day (sirtuin activation, take with fat)
- Spermidine: 1-2mg/day (autophagy promotion)
- Metformin: Prescription only (longevity research, TAME trial)
- Rapamycin: Prescription only (mTOR inhibition, longevity research)

Quality Standards:
- Look for: NSF Certified for Sport, USP Verified, or ConsumerLab tested
- Trusted brands: Thorne, Pure Encapsulations, Life Extension, Jarrow, NOW Foods (budget)
- Avoid: Proprietary blends (hide doses), Amazon (counterfeit risk), gas station supplements
- Check: Certificate of Analysis (COA), third-party testing
- Store properly: Cool, dark place; refrigerate fish oil

Timing Guidelines:
- Morning with food: Vitamin D, CoQ10, B vitamins, Creatine
- Pre-workout: Caffeine + L-theanine (30-60 min before)
- Evening/bedtime: Magnesium, L-theanine, Glycine, Apigenin
- With meals: Fat-soluble vitamins (D, K, E, A), Omega-3
- Away from minerals: Separate calcium and iron (compete for absorption)`
  }
];

export function detectRelevantLayers(message: string): KnowledgeLayer[] {
  const lowerMessage = message.toLowerCase();
  const words = lowerMessage.split(/\s+/);

  const scored: { layer: KnowledgeLayer; score: number }[] = [];

  for (const layer of KNOWLEDGE_LAYERS) {
    let score = 0;
    for (const topic of layer.topics) {
      if (topic.includes(" ")) {
        if (lowerMessage.includes(topic)) {
          score += 2;
        }
      } else {
        if (words.some(w => w === topic || w.startsWith(topic) || w.endsWith(topic))) {
          score += 1;
        }
        if (lowerMessage.includes(topic)) {
          score += 0.5;
        }
      }
    }
    if (score > 0) {
      scored.push({ layer, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(s => s.layer);
}

export function getLayerById(id: string): KnowledgeLayer | undefined {
  return KNOWLEDGE_LAYERS.find(layer => layer.id === id);
}

export function searchKnowledgeBase(query: string): { layerId: string; layerName: string; excerpt: string }[] {
  const lowerQuery = query.toLowerCase();
  const queryTerms = lowerQuery.split(/\s+/).filter(t => t.length > 2);
  const results: { layerId: string; layerName: string; excerpt: string; score: number }[] = [];

  for (const layer of KNOWLEDGE_LAYERS) {
    const lowerContent = layer.content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = lowerContent.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    if (score > 0) {
      let bestPos = -1;
      let bestTermScore = 0;

      for (const term of queryTerms) {
        const idx = lowerContent.indexOf(term);
        if (idx !== -1) {
          const surroundingTerms = queryTerms.filter(t => {
            const tIdx = lowerContent.indexOf(t, Math.max(0, idx - 250));
            return tIdx !== -1 && tIdx < idx + 250;
          }).length;
          if (surroundingTerms > bestTermScore) {
            bestTermScore = surroundingTerms;
            bestPos = idx;
          }
        }
      }

      if (bestPos === -1) bestPos = 0;

      const lineStart = layer.content.lastIndexOf("\n", Math.max(0, bestPos - 50));
      const excerptStart = lineStart === -1 ? Math.max(0, bestPos - 100) : lineStart + 1;
      const excerpt = layer.content.substring(excerptStart, excerptStart + 500).trim();

      results.push({
        layerId: layer.id,
        layerName: layer.name,
        excerpt: excerpt.length === 500 ? excerpt + "..." : excerpt,
        score
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.map(({ layerId, layerName, excerpt }) => ({ layerId, layerName, excerpt }));
}
