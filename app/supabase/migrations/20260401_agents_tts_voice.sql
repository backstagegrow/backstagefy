alter table agents add column if not exists tts_voice text not null default 'onyx'
  check (tts_voice in ('alloy','echo','fable','onyx','nova','shimmer'));
