import React from "react";
import DateHeader from "./DateHeader";
import DailyRoutine from "./DailyRoutine";
import ReflectionPanel from "./ReflectionPanel";

export default function DailyLog() {
  return (
    <div className="daily-log-container">
      <DateHeader />
      <DailyRoutine />
      <ReflectionPanel />
    </div>
  );
}