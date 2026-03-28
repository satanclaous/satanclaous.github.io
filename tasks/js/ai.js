window.AI = (() => {
  const GEMINI_API_BASE =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  function getApiKey() {
    const settings = window.Store.getSettings();
    const key = settings && settings.geminiApiKey;
    if (!key) {
      throw new Error("Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.");
    }
    return key;
  }

  // Core API call — JSON mode (responseMimeType: "application/json")
  async function callGemini(prompt, systemInstruction) {
    const apiKey = getApiKey();
    const url = `${GEMINI_API_BASE}?key=${apiKey}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { responseMimeType: "application/json" },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || response.statusText;
      throw new Error(`Gemini API 오류: ${msg}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null) {
      throw new Error("Gemini API에서 유효한 응답을 받지 못했습니다.");
    }

    return JSON.parse(text);
  }

  // Chat-style API call — plain text response (no JSON mode)
  async function callGeminiChat(messages, systemInstruction) {
    const apiKey = getApiKey();
    const url = `${GEMINI_API_BASE}?key=${apiKey}`;

    const contents = messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const body = {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || response.statusText;
      throw new Error(`Gemini API 오류: ${msg}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null) {
      throw new Error("Gemini API에서 유효한 응답을 받지 못했습니다.");
    }

    return text;
  }

  // 1. Brain dump → structured tasks
  async function processBrainDump(text) {
    const projects = window.Store.getProjects();

    const contextLines = [];

    if (projects.length > 0) {
      contextLines.push("## 기존 프로젝트");
      projects.forEach((p) => {
        contextLines.push(`- ID: ${p.id}, 이름: ${p.name}`);
        if (p.roadmap && p.roadmap.milestones && p.roadmap.milestones.length > 0) {
          p.roadmap.milestones.forEach((m) => {
            contextLines.push(`  - 마일스톤 ID: ${m.id}, 제목: ${m.title}, 상태: ${m.status}`);
          });
        }
      });
    }

    const contextBlock =
      contextLines.length > 0
        ? `\n\n${contextLines.join("\n")}`
        : "\n\n(기존 프로젝트 없음)";

    const systemInstruction =
      "사용자의 두서없는 입력을 분석하여 개별 태스크로 분리하고, 기존 프로젝트와 로드맵에 맵핑하세요.";

    const prompt = `다음은 사용자의 입력입니다:

${text}
${contextBlock}

위 입력을 분석하여 아래 JSON 형식으로 반환하세요:
{
  "tasks": [
    {
      "title": "태스크 제목",
      "description": "상세 설명",
      "projectId": "기존 프로젝트 ID 또는 null",
      "milestoneId": "기존 마일스톤 ID 또는 null",
      "priority": "high | medium | low",
      "aiExecutable": true | false,
      "aiActionType": "email_draft | content_draft | research | subtask_breakdown | schedule | null"
    }
  ],
  "newProjectSuggestions": [
    {
      "name": "새 프로젝트 이름",
      "reason": "제안 이유"
    }
  ]
}

aiActionType 설명:
- email_draft: 이메일 작성이 필요한 태스크
- content_draft: 문서/콘텐츠 초안 작성
- research: 조사/리서치가 필요한 태스크
- subtask_breakdown: 세부 태스크로 분해가 필요한 복잡한 태스크
- schedule: 일정 수립이 필요한 태스크
- null: AI 자동 실행이 불필요한 태스크`;

    return await callGemini(prompt, systemInstruction);
  }

  // 2. Execute a task with AI
  async function executeTask(task) {
    const systemInstruction =
      "당신은 업무 자동화 AI 어시스턴트입니다. 주어진 태스크를 분석하고 요청된 작업을 수행하세요.";

    let prompt;
    let resultType;

    switch (task.aiActionType) {
      case "email_draft":
        resultType = "email";
        prompt = `다음 태스크에 대한 이메일 초안을 작성해주세요.

태스크 제목: ${task.title}
태스크 설명: ${task.description || "없음"}

이메일 형식으로 작성하되, 제목(Subject)과 본문을 포함해주세요.
다음 JSON 형식으로 반환하세요:
{ "result": "이메일 전체 내용", "type": "email" }`;
        break;

      case "content_draft":
        resultType = "content";
        prompt = `다음 태스크에 대한 콘텐츠 초안 또는 아웃라인을 작성해주세요.

태스크 제목: ${task.title}
태스크 설명: ${task.description || "없음"}

다음 JSON 형식으로 반환하세요:
{ "result": "콘텐츠 초안 전체 내용", "type": "content" }`;
        break;

      case "research":
        resultType = "research";
        prompt = `다음 태스크에 대해 조사한 내용을 요약해주세요.

태스크 제목: ${task.title}
태스크 설명: ${task.description || "없음"}

핵심 정보, 관련 사항, 추천 사항을 포함한 요약을 작성해주세요.
다음 JSON 형식으로 반환하세요:
{ "result": "조사 요약 내용", "type": "research" }`;
        break;

      case "subtask_breakdown":
        resultType = "subtasks";
        prompt = `다음 태스크를 실행 가능한 세부 태스크로 분해해주세요.

태스크 제목: ${task.title}
태스크 설명: ${task.description || "없음"}

다음 JSON 형식으로 반환하세요:
{
  "result": "세부 태스크 목록 요약",
  "type": "subtasks",
  "subtasks": [
    { "title": "세부 태스크 제목", "description": "설명" }
  ]
}`;
        break;

      case "schedule":
        resultType = "schedule";
        prompt = `다음 태스크에 대한 실행 일정을 수립해주세요.

태스크 제목: ${task.title}
태스크 설명: ${task.description || "없음"}

단계별 일정과 예상 소요 시간을 포함해주세요.
다음 JSON 형식으로 반환하세요:
{ "result": "일정 계획 내용", "type": "schedule" }`;
        break;

      default:
        throw new Error("이 태스크는 AI 자동 실행을 지원하지 않습니다.");
    }

    return await callGemini(prompt, systemInstruction);
  }

  // 3. Generate a roadmap for a project in one shot
  async function generateRoadmap(projectName, userInput) {
    const systemInstruction =
      "당신은 프로젝트 관리 전문가입니다. 사용자의 목표와 설명을 바탕으로 실현 가능한 로드맵을 작성해주세요.";

    const prompt = `프로젝트 이름: ${projectName}
사용자 설명: ${userInput}

위 정보를 바탕으로 프로젝트 로드맵을 작성해주세요.
다음 JSON 형식으로 반환하세요:
{
  "goal": "프로젝트의 최종 목표",
  "milestones": [
    {
      "title": "마일스톤 제목",
      "description": "상세 설명",
      "targetDate": "YYYY-MM-DD 형식의 목표 날짜",
      "keyResults": ["핵심 결과 1", "핵심 결과 2"],
      "status": "not_started"
    }
  ]
}`;

    return await callGemini(prompt, systemInstruction);
  }

  // 4. Multi-turn chat to refine a roadmap
  // isInit: if true, sends an initial greeting from AI without user message
  async function chatForRoadmap(projectName, messages, isInit) {
    const systemInstruction = `당신은 프로젝트 로드맵 작성을 도와주는 AI 어시스턴트입니다.
사용자와 대화를 통해 프로젝트 "${projectName}"의 목표, 일정, 주요 마일스톤을 파악하세요.
충분한 정보가 모이면 로드맵을 생성하고, 아직 정보가 부족하면 적절한 질문을 해주세요.

응답은 반드시 다음 JSON 형식을 따르세요:
{
  "reply": "사용자에게 보낼 메시지",
  "roadmap": null
}

로드맵을 생성할 준비가 되었을 때는 다음 형식으로 반환하세요:
{
  "reply": "로드맵을 생성했습니다!",
  "roadmap": {
    "goal": "프로젝트의 최종 목표",
    "milestones": [
      {
        "title": "마일스톤 제목",
        "description": "상세 설명",
        "targetDate": "YYYY-MM-DD",
        "keyResults": ["핵심 결과 1", "핵심 결과 2"],
        "status": "not_started"
      }
    ]
  }
}`;

    // For initial message, send a user message asking AI to start the conversation
    let chatMessages = messages;
    if (isInit || messages.length === 0) {
      chatMessages = [{ role: 'user', text: `"${projectName}" 프로젝트의 로드맵을 만들고 싶어요. 어떤 정보가 필요한가요?` }];
    }

    // Convert messages to Gemini contents format
    const contents = chatMessages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const apiKey = getApiKey();
    const url = `${GEMINI_API_BASE}?key=${apiKey}`;

    const body = {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { responseMimeType: "application/json" },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || response.statusText;
      throw new Error(`Gemini API 오류: ${msg}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null) {
      throw new Error("Gemini API에서 유효한 응답을 받지 못했습니다.");
    }

    return JSON.parse(text);
  }

  return {
    callGemini,
    callGeminiChat,
    processBrainDump,
    executeTask,
    generateRoadmap,
    chatForRoadmap,
  };
})();
