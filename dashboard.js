function cellToText(cell){if(!cell||cell.v==null)return '';const v=String(cell.v);const m=/^Date\((\d+),\s*(\d+),\s*(\d+)/.exec(v);if(m)return m[1]+'-'+String(Number(m[2])+1).padStart(2,'0')+'-'+String(Number(m[3])).padStart(2,'0');return v;}


    /* =================================================================================
       ★ Google Sheets 실시간 연동 — 아래 코드는 시트에서 데이터를 읽어
         DASHBOARD_DATA 객체를 자동으로 구성합니다.
         데이터 수정은 구글 시트에서 하세요! (HTML을 다시 만들 필요 없음)
       ================================================================================= */
    const SHEET_ID = '1fpdq2TzIblWrIFVg5ArCaGtC0j9G8sdc29prleBCXuA';
    const SHEET_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit';
    const SHEET_TABS = ['학계_총괄','설정','연혁','KPI','선순환체계','3대전략','로드맵','오픈랩_절차','오픈랩_선정과제','오픈랩_지원사항','대학파트너십','실증운영체계','윤리원칙','AI기본법','개인정보보호법','투명성이행절차','문화확산','외부거버넌스','교육현황'];
    let DASHBOARD_DATA = null;
    let lastGoodTabs = {};
    let dashboardLoading = false;

    // Sheet values are plain text. Escape only at HTML output boundaries.
    function escapeHtml(value){
      return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
        return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c];
      });
    }

    function gvizUrl(tab, cb){
      return 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq'
        + '?tqx=' + encodeURIComponent('out:json;responseHandler:' + cb)
        + '&sheet=' + encodeURIComponent(tab)
        + '&headers=1&_cb=' + Date.now();
    }
    // file:// 로 직접 열면 브라우저 Origin이 null이 되어 fetch가 CORS에 막히므로
    // <script> 태그 방식(JSONP)으로 읽는다 (script 태그에는 CORS가 적용되지 않음)
    function fetchTab(tab){
      return new Promise(function(resolve, reject){
        const cb = '__gviz_cb_' + Math.random().toString(36).slice(2);
        const script = document.createElement('script');
        const timer = setTimeout(function(){ cleanup(); reject(new Error(tab + ' 탭 읽기 시간 초과')); }, 25000);
        function cleanup(){ clearTimeout(timer); try{ delete window[cb]; }catch(e){ window[cb] = undefined; } if(script.parentNode) script.parentNode.removeChild(script); }
        window[cb] = function(resp){
          try{
            if(!resp || resp.status === 'error'){
              const m = resp && resp.errors && resp.errors[0] && (resp.errors[0].detailed_message || resp.errors[0].message);
              reject(new Error(tab + ' 탭 읽기 실패' + (m ? ' (' + m + ')' : '')));
              return;
            }
            const labels = (resp.table.cols || []).map(function(c){ return c.label || ''; });
            const rows = (resp.table.rows || []).map(function(r){
              const o = {};
              labels.forEach(function(h, i){
                const cell = r.c[i];
                o[h] = cellToText(cell);
              });
              return o;
            }).filter(function(o){ return labels.some(function(h){ return String(o[h] || '').trim() !== ''; }); });
            resolve(rows);
          }catch(e){ reject(e); }
          finally{ cleanup(); }
        };
        script.onerror = function(){ cleanup(); reject(new Error(tab + ' 탭 읽기 실패 (네트워크)')); };
        script.src = gvizUrl(tab, cb);
        document.head.appendChild(script);
      });
    }

    function sheetVal(rows, key){
      const r = rows.find(function(x){ return x['항목'] === key; });
      return r ? r['값'] : '';
    }

    function buildDashboardData(S){
      const PILLAR_CLASS = ['p-external', 'p-internal', 'p-culture'];
      return {
        vision: sheetVal(S['설정'], '비전'),
        academicProgress: S['학계_총괄'] || [],
        educationAsOf: sheetVal(S['설정'], '교육_기준일'),
        planSource: sheetVal(S['설정'], '중장기계획_근거'),
        tfInfo: {
          title: sheetVal(S['설정'], '대시보드_제목') || '서울시설공단 AI 전환 DashBoard',
          purpose: sheetVal(S['설정'], 'TF_목적'),
          structure: sheetVal(S['설정'], 'TF_조직구조'),
          members: sheetVal(S['설정'], 'TF_구성원'),
          period: sheetVal(S['설정'], 'TF_운영기간'),
          history: S['연혁'].map(function(r){ return { date: r['날짜'], event: r['내용'] }; })
        },
        kpis: S['KPI'].map(function(r){ return { title: r['지표명'], value: r['수치'], unit: r['단위'], desc: r['설명'] }; }),
        pillars: S['3대전략'].map(function(r, i){
          return { title: r['전략명'], icon: r['아이콘'], class: PILLAR_CLASS[i] || 'p-external', desc: r['설명'],
                   details: [r['세부1'], r['세부2'], r['세부3']].filter(function(x){ return String(x || '').trim() !== ''; }) };
        }),
        ecosystemFlow: { steps: S['선순환체계'].map(function(r){ return { phase: r['단계'], title: r['제목'], desc: r['설명'] }; }) },
        roadmap: S['로드맵'].map(function(r){
          return { year: r['연도'], phase: r['단계'], goal: r['목표'],
                   tasks: { external: r['외부기술협업'], internal: r['내부기반'], culture: r['문화확산'], performance: r['성과관리'] } };
        }),
        academicPartnerships: S['대학파트너십'].map(function(r){ return { univ: r['대학'], fields: r['주요연구_협력분야'] }; }),
        openLab: {
          process: S['오픈랩_절차'].map(function(r){ return { step: r['단계'], desc: r['설명'] }; }),
          selectedProjects: S['오픈랩_선정과제'].map(function(r){ return { name: r['과제명'], method: r['추진방식'], site: r['실증장소'], status: r['현재상태'], progress: r['최근진척'], nextAction: r['다음조치'], nextDate: r['예정시기'], asOf: r['확인기준일'] }; }),
          support: S['오픈랩_지원사항'].map(function(r){ return r['지원내용']; })
        },
        aiVerificationGuide: S['실증운영체계'].map(function(r){ return { category: r['구분'], content: r['가이드라인'] }; }),
        ethicsPrinciples: S['윤리원칙'].map(function(r){ return { category: r['관점'], title: r['원칙명'], desc: r['설명'] }; }),
        governanceCompliance: {
          aiAct: S['AI기본법'].map(function(r){ return { duty: r['의무사항'], target: r['적용범위'], content: r['내용'] }; }),
          privacyAct: {
            title: sheetVal(S['설정'], '개인정보보호법_제목'),
            rights: S['개인정보보호법'].map(function(r){ return { name: r['권리명'], desc: r['내용'] }; })
          },
          complianceProcess: S['투명성이행절차'].map(function(r){ return { step: r['단계'], desc: r['설명'] }; })
        },
        cultureCampaign: S['문화확산'].map(function(r){ return { title: r['제목'], desc: r['설명'] }; }),
        stakeholders: S['외부거버넌스'].map(function(r){ return { category: r['구분'], name: r['기관명'], desc: r['역할'] }; }),
        educationProgress: S['교육현황'].map(function(r){
          return { course: r['과정명'], date: r['교육일자'], target: r['교육대상'], limit: r['정원'], participants: r['공단참여'], status: r['상태'] };
        })
      };
    }

    function setLiveStatus(mode, text){
      const dot = document.getElementById('live-dot');
      const label = document.getElementById('live-status');
      if(dot){ dot.className = 'live-dot ' + mode; }
      if(label){ label.textContent = text; }
    }

    const TAB_CONTAINERS = {
      '학계_총괄': ['academic-progress-live'],
      '설정': ['header-container', 'tf-summary-container'],
      '연혁': ['tf-summary-container'],
      'KPI': ['kpi-container'],
      '선순환체계': ['ecosystem-container'],
      '3대전략': ['strategy-pillars-container'],
      '로드맵': ['roadmap-timeline-container'],
      '오픈랩_절차': ['openlab-process-container'],
      '오픈랩_선정과제': ['openlab-selected-container'],
      '오픈랩_지원사항': ['openlab-support-container'],
      '대학파트너십': ['univ-partnerships-container'],
      '실증운영체계': ['verification-guide-container'],
      '윤리원칙': ['ethics-container'],
      'AI기본법': ['law-act-container'],
      '개인정보보호법': ['privacy-act-container'],
      '투명성이행절차': ['compliance-process-container'],
      '문화확산': ['culture-campaigns-container'],
      '외부거버넌스': ['stakeholders-container'],
      '교육현황': ['education-container']
    };

    function appendSectionNotice(container, text){
      let notice;
      if(container.tagName === 'TBODY'){
        const row = document.createElement('tr');
        notice = document.createElement('td');
        notice.colSpan = 6;
        row.appendChild(notice);
        container.appendChild(row);
      }else{
        notice = document.createElement(container.tagName === 'UL' ? 'li' : 'div');
        container.appendChild(notice);
      }
      notice.className = 'data-notice';
      notice.textContent = text;
    }

    async function loadDashboard(isRefresh){
      if(dashboardLoading) return;
      dashboardLoading = true;
      setLiveStatus('loading', isRefresh ? '시트에서 다시 불러오는 중...' : '시트에서 불러오는 중...');
      const loading = document.getElementById('loading-overlay');
      if(loading) loading.style.display = 'flex';
      const errBox = document.getElementById('error-box');
      if(errBox) errBox.style.display = 'none';
      let summary = document.getElementById('data-load-summary');
      if(!summary){
        summary = document.createElement('p');
        summary.id = 'data-load-summary';
        summary.className = 'data-notice';
        summary.setAttribute('role', 'status');
        const bar = document.querySelector('.live-bar');
        if(bar) bar.insertAdjacentElement('afterend', summary);
      }
      summary.textContent = '';
      summary.hidden = true;
      try{
        const results = await Promise.allSettled(SHEET_TABS.map(function(t){ return fetchTab(t); }));
        const S = {};
        const failures = [];
        results.forEach(function(result, i){
          const tab = SHEET_TABS[i];
          if(result.status === 'fulfilled'){
            S[tab] = result.value;
            lastGoodTabs[tab] = result.value;
          }else{
            failures.push(tab);
            S[tab] = lastGoodTabs[tab] || [];
            console.warn(tab + ' 탭 조회 실패', result.reason);
          }
        });
        DASHBOARD_DATA = buildDashboardData(S);
        renderDashboard();
        SHEET_TABS.forEach(function(tab){
          const failed = failures.includes(tab);
          const empty = !failed && S[tab].length === 0;
          if(!failed && !empty) return;
          const text = failed
            ? tab + ': ' + (Object.prototype.hasOwnProperty.call(lastGoodTabs, tab)
                ? '새로고침에 실패하여 이전 조회 데이터를 표시합니다.'
                : '데이터를 불러오지 못했습니다.') + ' 상단 새로고침으로 다시 시도해 주세요.'
            : tab + ': 등록된 데이터가 없습니다.';
          (TAB_CONTAINERS[tab] || []).forEach(function(id){
            const container = document.getElementById(id);
            if(container) appendSectionNotice(container, text);
          });
        });
        const upd = sheetVal(S['설정'], '업데이트_기준일');
        const ver = sheetVal(S['설정'], '버전');
        if(failures.length){
          const allFailed = failures.length === SHEET_TABS.length;
          setLiveStatus('error', allFailed ? '전체 시트 조회 실패' : '일부 시트 조회 실패');
          summary.textContent = '조회 실패: ' + failures.join(', ') +
            '. 해당 영역의 안내를 확인하고 새로고침해 주세요.';
          summary.hidden = false;
        }else{
          setLiveStatus('ok', '시트 연동 중' + (upd ? ' · ' + upd + ' 기준' : '') + (ver ? ' · ' + ver : ''));
        }
      }catch(e){
        setLiveStatus('error', '화면 표시 실패');
        summary.textContent = '화면을 표시하지 못했습니다. 새로고침해 주세요.';
        summary.hidden = false;
        console.error(e);
      }finally{
        if(loading) loading.style.display = 'none';
        dashboardLoading = false;
      }
    }

    function refreshDashboard(){ loadDashboard(true); }
    // =================================================================================
    // 렌더링 엔진 (Vanilla Javascript로 DASHBOARD_DATA를 파싱해 HTML을 채움)
    // =================================================================================
    
    function renderDashboard() {
      const academicSection = document.getElementById("academic-progress-live");
      if (academicSection) academicSection.innerHTML = progressMarkup(DASHBOARD_DATA.academicProgress);
      const planNote = document.getElementById('roadmap-plan-note');
      if(planNote) planNote.textContent = DASHBOARD_DATA.planSource || '계획 근거 미등록';
      const educationTitle = document.getElementById('education-title');
      if(educationTitle){
        educationTitle.textContent = '🎓 행정안전부 공공 AI역량 교육과정 진행 현황' +
          (DASHBOARD_DATA.educationAsOf ? ' (' + DASHBOARD_DATA.educationAsOf + ' 기준)' : '');
      }
      // 1. Header 렌더링
      const headerContainer = document.getElementById('header-container');
      headerContainer.innerHTML = `
        <div class="brand-area">
          <span class="badge">Strategy Planning Partner</span>
          <h1 class="brand-title">${escapeHtml(DASHBOARD_DATA.tfInfo.title)}</h1>
        </div>
        <div class="vision-box">
          <span class="vision-label">Vision</span>
          <span class="vision-text">${escapeHtml(DASHBOARD_DATA.vision)}</span>
        </div>
      `;

      // 2. KPI 렌더링
      const kpiContainer = document.getElementById('kpi-container');
      kpiContainer.innerHTML = DASHBOARD_DATA.kpis.map(kpi => `
        <div class="glass-card kpi-card">
          <span class="kpi-title">${escapeHtml(kpi.title)}</span>
          <div class="kpi-value-container">
            <span class="kpi-value">${escapeHtml(kpi.value)}</span>
            <span class="kpi-unit">${escapeHtml(kpi.unit)}</span>
          </div>
          <p class="kpi-desc">${escapeHtml(kpi.desc)}</p>
        </div>
      `).join('');

      // 3. TF 요약 정보 렌더링
      const tfSummaryContainer = document.getElementById('tf-summary-container');
      tfSummaryContainer.innerHTML = `
        <div>
          <h3 class="tf-summary-title">🏛️ ${escapeHtml(DASHBOARD_DATA.tfInfo.title)}</h3>
          <ul class="tf-info-list">
            <li class="tf-info-item">
              <span class="tf-info-label">설립 목적</span>
              <span class="tf-info-val">${escapeHtml(DASHBOARD_DATA.tfInfo.purpose)}</span>
            </li>
            <li class="tf-info-item">
              <span class="tf-info-label">조직 구성</span>
              <span class="tf-info-val">${escapeHtml(DASHBOARD_DATA.tfInfo.structure)}</span>
            </li>
            <li class="tf-info-item">
              <span class="tf-info-label">운영 인력</span>
              <span class="tf-info-val">${escapeHtml(DASHBOARD_DATA.tfInfo.members)}</span>
            </li>
            <li class="tf-info-item">
              <span class="tf-info-label">운영 기간</span>
              <span class="tf-info-val">${escapeHtml(DASHBOARD_DATA.tfInfo.period)}</span>
            </li>
          </ul>
        </div>
        <div style="margin-top: 1.5rem; border-top: 2px solid #cbd5e1; padding-top: 1rem;">
          <span style="font-size:0.75rem; font-weight:800; color:var(--text-dark); text-transform:uppercase; letter-spacing:1.2px; display:block; margin-bottom:0.5rem;">추진 경과</span>
          <div style="display:flex; flex-direction:column; gap:0.4rem; max-height: 120px; overflow-y: auto; padding-right:0.3rem;">
            ${DASHBOARD_DATA.tfInfo.history.map(h => `
              <div style="display:flex; font-size:0.8rem; gap:0.6rem;">
                <span style="color:var(--primary); font-weight:800; min-width:55px;">${escapeHtml(h.date)}</span>
                <span style="color:var(--text-muted);">${escapeHtml(h.event)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      // 4. 선순환 실행체계 흐름 렌더링
      const ecosystemContainer = document.getElementById('ecosystem-container');
      ecosystemContainer.innerHTML = DASHBOARD_DATA.ecosystemFlow.steps.map(step => `
        <div class="ecosystem-step-card">
          <span class="step-badge">${escapeHtml(step.phase)}</span>
          <h4 class="step-title">${escapeHtml(step.title)}</h4>
          <p class="step-desc">${escapeHtml(step.desc)}</p>
        </div>
      `).join('');

      // 5. 3대 전략 체계 기둥 렌더링
      const strategyPillarsContainer = document.getElementById('strategy-pillars-container');
      strategyPillarsContainer.innerHTML = DASHBOARD_DATA.pillars.map(pillar => `
        <div class="glass-card pillar-card ${escapeHtml(pillar.class)}">
          <div>
            <div class="pillar-header">
              <div class="pillar-icon">${escapeHtml(pillar.icon)}</div>
              <h4 class="pillar-title">${escapeHtml(pillar.title)}</h4>
            </div>
            <p class="pillar-desc">${escapeHtml(pillar.desc)}</p>
          </div>
          <div>
            <span class="pillar-items-title">주요 실행 과제</span>
            <ul class="pillar-list">
              ${pillar.details.map(detail => `
                <li class="pillar-item">${escapeHtml(detail)}</li>
              `).join('')}
            </ul>
          </div>
        </div>
      `).join('');

      // 6. 중장기 로드맵 타임라인 렌더링
      const roadmapContainer = document.getElementById('roadmap-timeline-container');
      roadmapContainer.innerHTML = DASHBOARD_DATA.roadmap.map(node => `
        <div class="roadmap-node">
          <div class="roadmap-marker"></div>
          <div class="roadmap-time-label">
            <span class="time-year">${escapeHtml(node.year)}</span>
            <span class="time-phase">${escapeHtml(node.phase)}</span>
          </div>
          <div class="roadmap-body">
            <h4 class="roadmap-goal">${escapeHtml(node.goal)}</h4>
            <div class="roadmap-tasks-grid">
              <div class="roadmap-task-box">
                <span class="task-box-title">외부 협업</span>
                <p class="task-box-desc">${escapeHtml(node.tasks.external)}</p>
              </div>
              <div class="roadmap-task-box">
                <span class="task-box-title">내부 거버넌스</span>
                <p class="task-box-desc">${escapeHtml(node.tasks.internal)}</p>
              </div>
              <div class="roadmap-task-box">
                <span class="task-box-title">문화 확산</span>
                <p class="task-box-desc">${escapeHtml(node.tasks.culture)}</p>
              </div>
              <div class="roadmap-task-box">
                <span class="task-box-title">성과 관리</span>
                <p class="task-box-desc">${escapeHtml(node.tasks.performance)}</p>
              </div>
            </div>
          </div>
        </div>
      `).join('');

      // 7. 오픈랩 운영 절차 및 지원사항 렌더링
      const openlabProcessContainer = document.getElementById('openlab-process-container');
      openlabProcessContainer.innerHTML = DASHBOARD_DATA.openLab.process.map((p, idx) => `
        <div style="display:flex; gap:0.8rem; background:#ffffff; border:1px solid #e2e8f0; padding:0.8rem; border-radius:6px; align-items:center;">
          <span style="font-size:1.1rem; font-weight:900; color:var(--accent-1); min-width:25px;">0${idx+1}</span>
          <div>
            <strong style="font-size:0.88rem; display:block; color:var(--text-main);">${escapeHtml(p.step)}</strong>
            <span style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(p.desc)}</span>
          </div>
        </div>
      `).join('');

      const openlabSelectedContainer = document.getElementById('openlab-selected-container');
      if (openlabSelectedContainer && DASHBOARD_DATA.openLab.selectedProjects) {
        openlabSelectedContainer.innerHTML = DASHBOARD_DATA.openLab.selectedProjects.map((proj, idx) => `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-left:4px solid var(--secondary); padding:0.9rem; border-radius:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
              <strong style="font-size:0.88rem; color:#166534;">[선정과제 0${idx+1}] ${escapeHtml(proj.name)}</strong>
              <span style="font-size:0.75rem; font-weight:700; background:#dcfce7; color:#15803d; padding:0.15rem 0.5rem; border-radius:4px;">${escapeHtml(proj.site)}</span>
            </div>
            <p style="font-size:0.82rem; color:#14532d; margin:0;">• 실증방식 및 내용: ${escapeHtml(proj.method)}</p>
            <dl class="project-status-grid">
              <div><dt>현재 상태</dt><dd>${escapeHtml(proj.status || '확인 필요')}</dd></div>
              <div><dt>최근 진척</dt><dd>${escapeHtml(proj.progress || '미등록')}</dd></div>
              <div><dt>다음 조치</dt><dd>${escapeHtml(proj.nextAction || '미등록')}</dd></div>
              <div><dt>예정 시기</dt><dd>${escapeHtml(proj.nextDate || '미정')}</dd></div>
            </dl>
            <p class="project-asof">확인 기준: ${escapeHtml(proj.asOf || '확인 필요')}</p>
          </div>
        `).join('');
      }

      const openlabSupportContainer = document.getElementById('openlab-support-container');
      openlabSupportContainer.innerHTML = DASHBOARD_DATA.openLab.support.map(s => {
        const isNote = s.startsWith('※');
        const color = isNote ? 'var(--text-dark)' : 'var(--text-muted)';
        const style = isNote ? 'font-style:italic; font-size:0.78rem;' : 'font-size:0.83rem;';
        return `
          <li style="display:flex; gap:0.5rem; ${style} color:${color}; line-height:1.4; margin-bottom:0.4rem;">
            <span>${isNote ? '•' : '✓'}</span>
            <span>${escapeHtml(s)}</span>
          </li>
        `;
      }).join('');

      // 8. 대학 직접 파트너십 렌더링
      const univContainer = document.getElementById('univ-partnerships-container');
      univContainer.innerHTML = DASHBOARD_DATA.academicPartnerships.map(univ => `
        <div class="univ-card">
          <span class="univ-name">${escapeHtml(univ.univ)}</span>
          <span class="univ-fields">${escapeHtml(univ.fields)}</span>
        </div>
      `).join('');

      // 9. AI 윤리 7대 원칙 렌더링
      const ethicsContainer = document.getElementById('ethics-container');
      ethicsContainer.innerHTML = DASHBOARD_DATA.ethicsPrinciples.map(rule => `
        <div class="ethics-card">
          <span class="ethics-tag">${escapeHtml(rule.category)}</span>
          <h4 class="ethics-title">${escapeHtml(rule.title)}</h4>
          <p class="ethics-desc">${escapeHtml(rule.desc)}</p>
        </div>
      `).join('');

      // 10. AI법 및 개인정보보호법 렌더링
      const lawActContainer = document.getElementById('law-act-container');
      lawActContainer.innerHTML = DASHBOARD_DATA.governanceCompliance.aiAct.map(act => `
        <tr>
          <td style="font-weight:800; color:var(--primary);">${escapeHtml(act.duty)}</td>
          <td style="color:var(--text-muted);">${escapeHtml(act.target)}</td>
          <td>${escapeHtml(act.content)}</td>
        </tr>
      `).join('');

      const privacyTitleContainer = document.getElementById('privacy-title-container');
      privacyTitleContainer.innerText = DASHBOARD_DATA.governanceCompliance.privacyAct.title;

      const privacyActContainer = document.getElementById('privacy-act-container');
      privacyActContainer.innerHTML = DASHBOARD_DATA.governanceCompliance.privacyAct.rights.map(r => `
        <tr>
          <td style="font-weight:800; color:var(--accent-2); width:130px;">${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.desc)}</td>
        </tr>
      `).join('');

      // 11. 거버넌스 단계별 절차 렌더링
      const complianceProcessContainer = document.getElementById('compliance-process-container');
      complianceProcessContainer.innerHTML = DASHBOARD_DATA.governanceCompliance.complianceProcess.map((proc, idx) => `
        <div class="compliance-box">
          <div class="compliance-step">STAGE 0${idx+1}</div>
          <h4 class="compliance-title">${escapeHtml(proc.step)}</h4>
          <p class="compliance-desc">${escapeHtml(proc.desc)}</p>
        </div>
      `).join('');

      // 12. 문화 확산 콘텐츠 렌더링
      const cultureCampaignsContainer = document.getElementById('culture-campaigns-container');
      cultureCampaignsContainer.innerHTML = DASHBOARD_DATA.cultureCampaign.map(camp => `
        <div class="culture-card">
          <div class="culture-card-header">
            <h4 class="culture-card-title">${escapeHtml(camp.title)}</h4>
          </div>
          <p class="culture-card-desc">${escapeHtml(camp.desc)}</p>
        </div>
      `).join('');

      // 13. 유관기관 매핑 테이블 렌더링
      const stakeholdersContainer = document.getElementById('stakeholders-container');
      stakeholdersContainer.innerHTML = DASHBOARD_DATA.stakeholders.map(s => `
        <tr>
          <td style="font-weight:800; color:var(--accent-3);">${escapeHtml(s.category)}</td>
          <td style="font-weight:800; color:var(--text-main);">${escapeHtml(s.name)}</td>
          <td style="color:var(--text-muted);">${escapeHtml(s.desc)}</td>
        </tr>
      `).join('');

      // 14. 행안부 공공 AI역량 교육과정 진행 현황 렌더링 (추가)
      const educationContainer = document.getElementById('education-container');
      educationContainer.innerHTML = DASHBOARD_DATA.educationProgress.map(edu => {
        let statusBadge = '';
        if (edu.status.includes('완료')) {
          statusBadge = `<span style="background: rgba(13, 148, 136, 0.08); border: 1px solid rgba(13, 148, 136, 0.25); color: var(--accent-1); padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.8rem;">${escapeHtml(edu.status)}</span>`;
        } else {
          statusBadge = `<span style="background: rgba(217, 119, 6, 0.08); border: 1px solid rgba(217, 119, 6, 0.25); color: var(--accent-3); padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.8rem;">${escapeHtml(edu.status)}</span>`;
        }
        return `
          <tr>
            <td style="font-weight:800; color:var(--text-main);">${escapeHtml(edu.course)}</td>
            <td style="color:var(--text-muted);">${escapeHtml(edu.date)}</td>
            <td style="color:var(--text-muted);">${escapeHtml(edu.target)}</td>
            <td style="color:var(--text-muted);">${escapeHtml(edu.limit)}</td>
            <td style="font-weight:700; color:var(--primary);">${escapeHtml(edu.participants)}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }).join('');

      // 15. AI 실증협업 가이드 렌더링 (추가)
      const guideContainer = document.getElementById('verification-guide-container');
      guideContainer.innerHTML = DASHBOARD_DATA.aiVerificationGuide.map(g => `
        <tr>
          <td style="font-weight:800; color:var(--primary); padding: 0.5rem 0.8rem;">${escapeHtml(g.category)}</td>
          <td style="color:var(--text-muted); padding: 0.5rem 0.8rem;">${escapeHtml(g.content)}</td>
        </tr>
      `).join('');
    }

    // =================================================================================
    // 탭 듀얼 제어 함수 (Tab switching logic)
    // =================================================================================
    function switchTab(tabId) {
      // 모든 탭 컨텐츠 숨기기
      const contents = document.querySelectorAll('.tab-content');
      contents.forEach(content => content.classList.remove('active'));

      // 모든 탭 버튼 비활성화
      const buttons = document.querySelectorAll('.tab-btn');
      buttons.forEach(btn => btn.classList.remove('active'));

      // 선택된 탭 활성화
      document.getElementById(tabId).classList.add('active');

      // 클릭한 버튼 활성화
      const clickedBtn = Array.from(buttons).find(btn => btn.getAttribute('onclick').includes(tabId));
      if (clickedBtn) {
        clickedBtn.classList.add('active');
      }
    }

    // 초기 실행: 시트에서 데이터를 읽어 렌더링
    window.addEventListener('DOMContentLoaded', () => {
      const link = document.getElementById('sheet-open-link');
      if(link) link.href = SHEET_URL;
      loadDashboard(false);
    });
  
// Embedded university collaboration dashboard v3 (single-file package)
    

    function openUniversityDashboard(event) {
      if(event)event.preventDefault();
      try{
        const bytes=Uint8Array.from(atob(UNIVERSITY_DASHBOARD_V2_B64),c=>c.charCodeAt(0));
        const page=new TextDecoder('utf-8').decode(bytes).replaceAll('href="index.html"','href="'+escapeHtml(location.href)+'"');
        const url=URL.createObjectURL(new Blob([page],{type:'text/html;charset=utf-8'}));
        const opened=window.open(url,'_blank');if(!opened)location.href=url;
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      }catch(e){console.error(e);alert('학계 실행대시보드를 열 수 없습니다. 배포파일 3개가 같은 폴더에 있는지 확인해 주세요.');}
    }
function progressMarkup(rows){const sorted=[...rows].sort((a,b)=>(Number(a['순서'])||0)-(Number(b['순서'])||0)),lead=sorted.find(r=>r['구분']==='설명'),next=sorted.find(r=>r['구분']==='후속'),sources=sorted.find(r=>r['구분']==='근거');if(!rows.length)return '<div class="notice">학계_총괄 탭에 등록된 설명이 없습니다.</div>';return '<section class="academic-story" aria-label="학계협력 추진경과">'+(lead?'<div class="academic-story-lead"><span class="academic-story-kicker">일하는 방식의 변화</span><h4>'+escapeHtml(lead['제목']).replace(/\n/g,'<br>')+'</h4><p>'+escapeHtml(lead['내용'])+'</p></div>':'')+'<h4 class="academic-story-heading">학계협력 추진경과</h4><ol class="academic-story-timeline">'+sorted.filter(r=>['경과','성과'].includes(r['구분'])).map(r=>'<li class="'+(r['구분']==='성과'?'academic-story-achieved':'')+'"><span class="academic-story-date">'+escapeHtml(r['시기'])+'</span><div><b>'+escapeHtml(r['제목'])+'</b><p>'+escapeHtml(r['내용'])+'</p></div></li>').join('')+'</ol><h4 class="academic-story-heading">교류를 넘어 과제 중심의 협력으로</h4><div class="academic-story-changes">'+sorted.filter(r=>r['구분']==='변화').map(r=>'<div><span>'+escapeHtml(r['제목'])+'</span><p>'+escapeHtml(r['내용'])+'</p></div>').join('')+'</div>'+(next?'<div class="academic-story-next"><b>'+escapeHtml(next['제목'])+' · '+escapeHtml(next['시기'])+' 기준</b><p>'+escapeHtml(next['내용'])+'</p></div>':'')+(sources?'<p class="academic-story-sources">근거: '+escapeHtml(sources['내용'])+'</p>':'')+'</section>';}
