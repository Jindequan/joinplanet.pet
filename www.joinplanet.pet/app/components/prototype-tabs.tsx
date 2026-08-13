"use client";

import { useState } from "react";

const tabs = ["Today", "Timeline", "Health", "People", "Memories"] as const;
type Tab = (typeof tabs)[number];

export function PrototypeTabs() {
  const [tab, setTab] = useState<Tab>("Today");

  return (
    <div className="planet-stage narrative-shell" data-prototype-tab={tab.toLowerCase()}>
      <aside className="planet-profile">
        <div className="planet-pet"><img src="/mydog2.jpg" alt="Milo" /><div><strong>Milo</strong><span>5 years · very much himself</span></div></div>
        <nav aria-label="PLANET interactive prototype sections">
          {tabs.map((item) => <button className={item === tab ? "active" : ""} key={item} type="button" onClick={() => setTab(item)} data-event="prototype_tab" data-event-category="prototype" data-event-label={item.toLowerCase()}>{item}</button>)}
        </nav>
        <small>INTERACTIVE PROTOTYPE · HELP US DECIDE WHAT COMES FIRST</small>
      </aside>

      {tab === "Today" ? <TodayView /> : null}
      {tab === "Timeline" ? <TimelineView /> : null}
      {tab === "Health" ? <HealthView /> : null}
      {tab === "People" ? <PeopleView /> : null}
      {tab === "Memories" ? <MemoriesView /> : null}
      <a className="prototype-feedback-link" href="#invitation" data-event="prototype_feedback" data-event-category="prototype" data-event-label="prototype_feedback_link">Tell us what you would use first <span className="icon icon-arrow-down-right" aria-hidden="true" /></a>
    </div>
  );
}

function TodayView() {
  return <div className="planet-today"><div className="planet-date"><span>WEDNESDAY · AUG 13</span><strong>Good morning, Milo.</strong><p>Three people are keeping today connected.</p></div><div className="today-list"><article><span className="today-check"><span className="icon icon-check" aria-hidden="true" /></span><div><strong>Breakfast</strong><small>completed by Devin · 8:12</small></div><time>done</time></article><article><span className="today-check"><span className="icon icon-check" aria-hidden="true" /></span><div><strong>Morning medicine</strong><small>16 mg · with food</small></div><time>done</time></article><article className="today-active"><span className="today-check"><span className="icon icon-circle-dot" aria-hidden="true" /></span><div><strong>Notice his appetite</strong><small>Devin left a note at lunch</small></div><time>today</time></article><article><span className="today-check"><span className="icon icon-circle-dot" aria-hidden="true" /></span><div><strong>Evening walk</strong><small>no exact time · take the long way</small></div><time>later</time></article></div></div>;
}

function TimelineView() {
  return <div className="planet-today prototype-timeline-view"><div className="planet-date"><span>HEALTH TIMELINE · MILO</span><strong>The small things, connected.</strong><p>Every note keeps its date and its source.</p></div><div className="prototype-event-list"><article><time>JUL 24</time><div><strong>Weight · 5.4 kg</strong><small>Normal appetite · recorded by Devin</small></div></article><article><time>AUG 02</time><div><strong>New medication</strong><small>Apoquel · 16 mg with breakfast</small></div></article><article className="prototype-event-active"><time>AUG 13</time><div><strong>Ate half of lunch</strong><small>Photo and note · recorded by Devin</small></div></article></div><button className="prototype-inline-action" type="button"><span className="icon icon-plus" aria-hidden="true" /> Add a moment</button></div>;
}

function HealthView() {
  return <div className="planet-today prototype-health-view"><div className="planet-date"><span>HEALTH · REVIEW BEFORE SHARING</span><strong>What changed lately?</strong><p>PLANET organizes observations. Your vet makes the medical call.</p></div><div className="health-signal-grid"><div><span>Appetite</span><strong>Lower than usual</strong><small>2 notes this week</small></div><div><span>Weight</span><strong>5.2 kg</strong><small>−0.2 kg in 3 weeks</small></div><div><span>Medication</span><strong>1 active</strong><small>Apoquel · 16 mg</small></div><div className="health-signal-note"><span>Ready for a vet summary?</span><p>Include the recent change, current medication and your question.</p></div></div><button className="prototype-inline-action" type="button">Preview vet summary <span className="icon icon-arrow-up-right" aria-hidden="true" /></button></div>;
}

function PeopleView() {
  return <div className="planet-today prototype-people-view"><div className="planet-date"><span>PEOPLE · ONE PET, DIFFERENT VIEWS</span><strong>Care is a shared verb.</strong><p>Everyone gets the context they need for the moment they are in.</p></div><div className="people-list"><article><span className="person-avatar">D</span><div><strong>Devin</strong><small>Owner · full record</small></div><b>Owner</b></article><article><span className="person-avatar person-avatar-clay">A</span><div><strong>Alex</strong><small>Partner · today + care</small></div><b>Caregiver</b></article><article><span className="person-avatar person-avatar-gold">S</span><div><strong>Sitter link</strong><small>Read-only · expires Sunday</small></div><b>Shared</b></article></div><button className="prototype-inline-action" type="button"><span className="icon icon-plus" aria-hidden="true" /> Invite someone who cares</button></div>;
}

function MemoriesView() {
  return <div className="planet-today prototype-memories-view"><div className="planet-date"><span>MEMORIES · MILO&apos;S LIFE</span><strong>The parts no spreadsheet can hold.</strong><p>Small details become a living sense of who they are.</p></div><div className="memory-preview-grid"><figure><img src="/mydog2.jpg" alt="Milo at home" /><figcaption>That look he gives when the walk is late.</figcaption></figure><figure><img src="/mydog.JPG" alt="Milo after an appointment" /><figcaption>Brave at the appointment · Aug 13</figcaption></figure></div></div>;
}
