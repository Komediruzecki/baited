import React from 'react';
import { createRoot } from 'react-dom/client';
import CardDesignLab from './CardDesignLab';
import './card-lab-standalone.css';
import './scrollbars.css';
import './scrollbars';

// A fixed synthetic session opens design studies without bootstrapping the game,
// fetching a session, loading speech models or connecting to Twitch.
createRoot(document.getElementById('root')!).render(
  <CardDesignLab
    session={{ authenticated: false, twitchReady: false, demoAvailable: true, speechReady: false }}
    standalone
  />,
);
