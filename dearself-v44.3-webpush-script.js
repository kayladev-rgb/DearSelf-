/* ============================================================
   DearSelf V44.3 — SAFER CENTRAL WEB PUSH SCHEDULER
   Replace the existing #dearself-v39-webpush block with this.
   No DS_API_KEY is used or stored in the frontend.
   ============================================================ */
(function(){
  const DS_PUSH_SERVER = 'https://YOUR-PUSH-SERVER.example.com';

  function configured(){
    return DS_PUSH_SERVER &&
      !DS_PUSH_SERVER.includes('YOUR-PUSH-SERVER');
  }

  function urlBase64ToUint8Array(base64String){
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  async function api(path, body){
    const res = await fetch(DS_PUSH_SERVER + path, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error(`Push server ${res.status}`);
    return res.json();
  }

  async function getSubscription(){
    if(!('serviceWorker' in navigator) || !('PushManager' in window)){
      throw new Error('Push is not supported');
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if(!sub){
      const keyRes = await fetch(DS_PUSH_SERVER + '/api/vapid-public-key');
      if(!keyRes.ok) throw new Error('Could not load VAPID public key');
      const {key} = await keyRes.json();
      if(!key) throw new Error('Missing VAPID public key');

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key)
      });
    }

    return sub;
  }

  function dueMillis(date, time){
    if(!date) return NaN;
    const d = new Date(String(date) + 'T' + (time || '23:59'));
    return d.getTime();
  }

  function nextClassOccurrences(x, now, daysAhead=35){
    const result = [];
    const days = Array.isArray(x.repeatDays) && x.repeatDays.length
      ? x.repeatDays
      : [x.day || 'Monday'];

    const startMin = typeof ttTimeToMinutes === 'function'
      ? ttTimeToMinutes(x.startTime || x.time)
      : null;

    if(startMin === null || !Number.isFinite(startMin)) return result;

    const base = new Date(now);

    for(let add=0; add<=daysAhead; add++){
      const d = new Date(base);
      d.setDate(base.getDate() + add);

      const name = typeof TT_DAYS !== 'undefined'
        ? TT_DAYS[(d.getDay()+6)%7]
        : ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][(d.getDay()+6)%7];

      const matches =
        days.includes(name) ||
        (x.repeatMode === 'weekdays' && d.getDay() >= 1 && d.getDay() <= 5);

      if(!matches) continue;

      const fire = new Date(d);
      fire.setHours(Math.floor(startMin/60), startMin%60, 0, 0);

      if(fire.getTime() > now){
        result.push(fire.getTime());
      }
    }

    return result;
  }

  function collectPushReminders(){
    const s = state.notificationSettings || {};
    const lead = Math.max(0, Number(s.leadMinutes) || 15) * 60000;
    const now = Date.now();
    const out = [];

    function add(key, when, title, body, url='/'){
      if(!Number.isFinite(when)) return;
      const fireAt = when - lead;
      if(fireAt <= now) return;

      out.push({
        key: String(key),
        title: String(title || 'DearSelf'),
        body: String(body || ''),
        fireAt,
        url: String(url || '/').startsWith('/') ? String(url) : '/'
      });
    }

    // Study sessions
    if(s.study){
      (state.studySessions || []).forEach((x,i)=>{
        if(x.notifications === false) return;
        const when = Number(x.startMillis);
        add(
          'study:' + (x.id || i) + ':' + when,
          when,
          'Study session coming up',
          `${x.course || 'Study'}${x.topic ? ' — ' + x.topic : ''} starts soon.`,
          '/'
        );
      });
    }

    // Assignments
    if(s.assignments){
      (state.assignments || []).forEach((a,i)=>{
        if(a.notifications === false || a.status === 'Completed' || a.status === 'Submitted') return;
        const when = dueMillis(a.due, a.dueTime || '23:59');
        add(
          'assignment:' + (a.id || i),
          when,
          'Assignment due soon',
          `${a.title || 'Assignment'} is due ${new Date(when).toLocaleString()}.`,
          '/'
        );
      });
    }

    // Exams
    if(s.exams){
      (state.exams || []).forEach((e,i)=>{
        if(e.notifications === false) return;
        const when = dueMillis(e.date, e.time || '10:00');
        add(
          'exam:' + (e.id || i),
          when,
          'Exam coming up',
          `${e.title || 'Exam'}${e.course ? ' · ' + e.course : ''} is scheduled for ${new Date(when).toLocaleString()}.`,
          '/'
        );
      });
    }

    // Calendar
    if(s.calendar){
      (state.events || []).forEach((e,i)=>{
        if(e.notifications === false) return;
        const when =
          e.allDay === false && e.time
            ? dueMillis(e.date, e.time)
            : dueMillis(e.date, '09:00');

        add(
          'event:' + (e.id || i),
          when,
          'Event coming up',
          `${e.title || 'Calendar event'} is scheduled for ${new Date(when).toLocaleString()}.`,
          '/'
        );
      });
    }

    // General + School to-do
    if(s.todo){
      [
        ...(state.tasks || []).map((x,i)=>({x,i,kind:'task'})),
        ...(state.schoolTodos || []).map((x,i)=>({x,i,kind:'schooltodo'}))
      ].forEach(({x,i,kind})=>{
        if(x.notifications === false || x.done) return;

        const when = dueMillis(x.due, x.dueTime || '23:59');

        add(
          kind + ':' + (x.id || i),
          when,
          'To-do due soon',
          `${x.title || 'Task'} is due ${new Date(when).toLocaleString()}.`,
          '/'
        );
      });
    }

    // Timetable — queue 35 days of occurrences, not just the next class.
    if(s.timetable){
      (state.timetable || []).forEach((x,i)=>{
        if(x.notifications === false) return;

        nextClassOccurrences(x, now, 35).forEach(when=>{
          const iso = new Date(when).toISOString();

          add(
            'class:' + (x.id || i) + ':' + iso,
            when,
            'Class coming up',
            `${x.course || 'Class'} starts at ${new Date(when).toLocaleTimeString([], {
              hour:'numeric',
              minute:'2-digit'
            })}.`,
            '/'
          );
        });
      });
    }

    // Keep only future reminders and avoid duplicate keys.
    const seen = new Set();
    return out
      .filter(x => {
        if(seen.has(x.key)) return false;
        seen.add(x.key);
        return x.fireAt > now;
      })
      .sort((a,b)=>a.fireAt-b.fireAt)
      .slice(0,500);
  }

  async function syncPushSchedule(){
    if(!configured()) return;

    try{
      const sub = await getSubscription();

      await api('/api/subscribe', {
        subscription: sub.toJSON()
      });

      await api('/api/schedule', {
        subscription: sub.toJSON(),
        items: collectPushReminders()
      });
    }catch(e){
      console.warn('DearSelf push sync failed:', e);
    }
  }

  window.subscribeDearSelfPush = async function(){
    if(!configured()){
      toast('Background notifications are not configured yet.');
      return;
    }

    if(!('Notification' in window)){
      toast('This browser does not support device notifications.');
      return;
    }

    try{
      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();

      if(permission !== 'granted'){
        toast(permission === 'denied'
          ? 'Notifications were blocked by the browser.'
          : 'Notification permission was not changed.');
        return;
      }

      await syncPushSchedule();
      toast('Background notifications enabled ♡');
    }catch(e){
      console.error('DearSelf push subscribe failed:', e);
      toast('Could not enable background notifications.');
    }
  };

  window.unsubscribeDearSelfPush = async function(){
    try{
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if(sub){
        await fetch(DS_PUSH_SERVER + '/api/unsubscribe', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({endpoint:sub.endpoint})
        });
        await sub.unsubscribe();
      }

      toast('Background notifications disabled.');
    }catch(e){
      console.warn('DearSelf push unsubscribe failed:', e);
    }
  };

  let syncTimer = null;

  window.__dsPushSyncHook = function(){
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPushSchedule, 1500);
  };

  window.addEventListener('load', ()=>{
    setTimeout(()=>{
      if(typeof Notification !== 'undefined' &&
         Notification.permission === 'granted'){
        syncPushSchedule();
      }
    }, 1800);
  });

  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible'){
      clearTimeout(syncTimer);
      syncTimer = setTimeout(syncPushSchedule, 500);
    }
  });

  // Expose the collector for debugging/testing without exposing secrets.
  window.collectDearSelfPushReminders = collectPushReminders;
})();
