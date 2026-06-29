// Guided anatomy lessons + quiz questions.
export type QuizQuestion = {
  q: string;
  options: string[];
  answer: number; // index into options
  explain: string;
};

export type Lesson = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  container: string; // GLB container to isolate/frame in the viewer
  intro: string;
  // muscle node names highlighted as the lesson's focus
  focus: string[];
  points: { heading: string; body: string }[];
  quiz: QuizQuestion[];
};

export const LESSONS: Lesson[] = [
  {
    id: "pushing",
    title: "The Pushing Muscles",
    subtitle: "Chest · Shoulders · Triceps",
    icon: "fitness-outline",
    container: "Muscles_Arm_Upper",
    intro:
      "Pushing movements like the bench press and overhead press are driven by a chain of muscles working together to extend the arm away from the body.",
    focus: ["Pectoralis_Major_Clavicular_Sternocostal_Abdominal", "Deltoid_Anterior_Middle_Posterior", "Triceps_Lateral_Long_Heads"],
    points: [
      { heading: "Pectoralis Major", body: "The big fan-shaped chest muscle. It flexes and adducts the upper arm — the prime mover in pressing." },
      { heading: "Anterior Deltoid", body: "The front of the shoulder assists every press and is the prime mover in the overhead press." },
      { heading: "Triceps Brachii", body: "Extends the elbow to lock out the press. Three heads share the work via the olecranon." },
    ],
    quiz: [
      { q: "Which muscle is the prime mover in the bench press?", options: ["Latissimus Dorsi", "Pectoralis Major", "Biceps Brachii", "Gluteus Maximus"], answer: 1, explain: "The pectoralis major adducts and flexes the humerus to push the bar up." },
      { q: "The triceps brachii primarily acts to…", options: ["Flex the elbow", "Extend the elbow", "Rotate the wrist", "Flex the hip"], answer: 1, explain: "It extends the elbow, locking out a press." },
      { q: "Which head of the deltoid drives the overhead press?", options: ["Posterior", "Anterior", "Lateral", "Spinal"], answer: 1, explain: "The anterior (front) deltoid is the prime mover overhead." },
    ],
  },
  {
    id: "pulling",
    title: "The Pulling Muscles",
    subtitle: "Back · Lats · Biceps",
    icon: "barbell-outline",
    container: "Muscles_Torso",
    intro:
      "Pulling movements like rows and pull-ups bring the arms toward the body and retract the shoulder blades, building the muscles of the back.",
    focus: ["Latissimus_Dorsi", "Trapezius", "Rhomboideus_Major", "Biceps_Brachii"],
    points: [
      { heading: "Latissimus Dorsi", body: "The largest back muscle. It extends and adducts the shoulder — the engine of pull-ups and pulldowns." },
      { heading: "Trapezius & Rhomboids", body: "Retract and stabilise the scapula, key for rowing and posture." },
      { heading: "Biceps Brachii", body: "Flexes the elbow to assist every pull and supinates the forearm." },
    ],
    quiz: [
      { q: "Which muscle is the prime mover in a pull-up?", options: ["Pectoralis Major", "Latissimus Dorsi", "Triceps", "Soleus"], answer: 1, explain: "The lats adduct and extend the shoulder to pull you up." },
      { q: "The rhomboids primarily…", options: ["Extend the knee", "Retract the scapula", "Flex the wrist", "Rotate the neck"], answer: 1, explain: "They draw the shoulder blades toward the spine." },
      { q: "Which muscle supinates the forearm while flexing the elbow?", options: ["Brachialis", "Biceps Brachii", "Triceps", "Deltoid"], answer: 1, explain: "The biceps both flex the elbow and supinate the forearm." },
    ],
  },
  {
    id: "legs",
    title: "Legs & Glutes",
    subtitle: "Quads · Hamstrings · Glutes",
    icon: "walk-outline",
    container: "Muscles_Leg_Upper",
    intro:
      "The largest muscles in the body power squatting, hinging and walking. Quads extend the knee, hamstrings flex it, and the glutes extend the hip.",
    focus: ["Rectus_Femoris", "Vastus_Lateralis", "Biceps_Femoris_Long_Head", "Gluteus_Maximus"],
    points: [
      { heading: "Quadriceps", body: "Four muscles on the front of the thigh that extend the knee. Only the rectus femoris also crosses the hip." },
      { heading: "Hamstrings", body: "Three muscles on the back of the thigh that flex the knee and extend the hip." },
      { heading: "Gluteus Maximus", body: "The strongest muscle in the body. It extends and externally rotates the hip." },
    ],
    quiz: [
      { q: "Which muscle extends the knee?", options: ["Hamstrings", "Quadriceps", "Gastrocnemius", "Latissimus Dorsi"], answer: 1, explain: "The quadriceps extend the knee via the patellar ligament." },
      { q: "The gluteus maximus primarily…", options: ["Flexes the hip", "Extends the hip", "Flexes the knee", "Rotates the wrist"], answer: 1, explain: "It is the prime hip extensor." },
      { q: "Which quad muscle also crosses the hip joint?", options: ["Vastus Lateralis", "Vastus Medialis", "Rectus Femoris", "Vastus Intermedius"], answer: 2, explain: "Only the rectus femoris crosses both the hip and knee." },
    ],
  },
  {
    id: "core",
    title: "The Core",
    subtitle: "Abs · Obliques",
    icon: "shield-outline",
    container: "Muscles_Torso",
    intro:
      "The core stabilises the spine and pelvis and transfers force between the upper and lower body. It does far more than 'crunch'.",
    focus: ["Rectus_Abdominis", "External_Oblique", "Psoas_Major"],
    points: [
      { heading: "Rectus Abdominis", body: "The 'six-pack'. Flexes the trunk and resists extension to brace the spine." },
      { heading: "External Oblique", body: "Rotates and side-bends the trunk and compresses the abdomen." },
      { heading: "Psoas Major", body: "A deep hip flexor that also stabilises the lumbar spine." },
    ],
    quiz: [
      { q: "The rectus abdominis primarily…", options: ["Extends the spine", "Flexes the trunk", "Abducts the hip", "Rotates the shoulder"], answer: 1, explain: "It flexes the trunk and braces against extension." },
      { q: "Which muscle rotates and side-bends the trunk?", options: ["External Oblique", "Soleus", "Triceps", "Trapezius"], answer: 0, explain: "The obliques rotate and laterally flex the trunk." },
      { q: "The psoas major is a…", options: ["Knee extensor", "Hip flexor", "Elbow flexor", "Ankle plantarflexor"], answer: 1, explain: "It is a primary hip flexor connecting spine to femur." },
    ],
  },
  {
    id: "calves",
    title: "Lower Leg & Calf",
    subtitle: "Gastrocnemius · Soleus",
    icon: "footsteps-outline",
    container: "Muscles_Leg_Lower",
    intro:
      "The calf complex plantarflexes the ankle to push off the ground. Two muscles share the Achilles tendon but work at different knee angles.",
    focus: ["Gastrocnemius_Lateral_Medial", "Soleus", "Tibialis_Anterior"],
    points: [
      { heading: "Gastrocnemius", body: "The diamond-shaped calf. It crosses the knee, so it's strongest with a straight leg (standing calf raise)." },
      { heading: "Soleus", body: "Lies beneath the gastroc. It works best with a bent knee (seated calf raise)." },
      { heading: "Tibialis Anterior", body: "On the front of the shin — it dorsiflexes the foot, the antagonist to the calves." },
    ],
    quiz: [
      { q: "Which calf muscle is best trained with a bent knee?", options: ["Gastrocnemius", "Soleus", "Tibialis Anterior", "Peroneus"], answer: 1, explain: "The soleus doesn't cross the knee, so it's targeted with a seated (bent-knee) raise." },
      { q: "The tibialis anterior performs…", options: ["Plantarflexion", "Dorsiflexion", "Knee flexion", "Hip extension"], answer: 1, explain: "It dorsiflexes the foot, opposing the calves." },
      { q: "Both calf muscles insert via the…", options: ["Patellar ligament", "Achilles tendon", "Biceps tendon", "IT band"], answer: 1, explain: "They share the Achilles tendon onto the calcaneus." },
    ],
  },
];

export function getLesson(id: string) {
  return LESSONS.find((l) => l.id === id);
}
