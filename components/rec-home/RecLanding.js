"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import "./rec-home.css"

const SLIDES = [
  {
    src: "/badge/DJI_0442.webp",
    alt: "REC exhibition grounds at the Serena",
  },
  {
    src: "/badge/SM2_8651.webp",
    alt: "Opening ceremony of the Renewable Energy Conference",
  },
  {
    src: "/badge/SM2_9154.webp",
    alt: "Delegates in the REC conference hall",
  },
]

const DWELL_MS = 7000

export default function RecLanding() {
  const [index, setIndex] = useState(0)
  const [run, setRun] = useState(0)

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (motion.matches) return undefined
    let timer = 0
    const start = () => {
      window.clearInterval(timer)
      timer = window.setInterval(() => {
        setIndex((current) => (current + 1) % SLIDES.length)
      }, DWELL_MS)
    }
    const onHide = () => {
      if (document.hidden) window.clearInterval(timer)
      else start()
    }
    start()
    document.addEventListener("visibilitychange", onHide)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onHide)
    }
  }, [run])

  const chooseSlide = (next) => {
    setIndex(next)
    setRun((current) => current + 1)
  }

  return (
    <main className="rec-home" style={{ "--rec-home-dwell": `${DWELL_MS}ms` }}>
      <div className="rec-home-slides" aria-hidden="true">
        {SLIDES.map((slide, slideIndex) => (
          <img
            key={slide.src}
            src={slide.src}
            alt=""
            className={slideIndex === index ? "is-active" : ""}
          />
        ))}
      </div>
      <div className="rec-home-shade" />
      <section className="rec-home-panel">
        <img className="rec-home-mark" src="/badge/rec26-nrep.png" alt="NREP" />
        <p className="rec-home-kicker">Renewable Energy Conference</p>
        <h1>REC26 &amp; Expo</h1>
        <p className="rec-home-when">19–22 October 2026 · Kampala Serena Hotel</p>
        <p className="rec-home-copy">
          Open the Tera station, choose the gun in your hand, and scan badges. The conference desk covers registrations and the programme.
        </p>
        <div className="rec-home-actions">
          <Link className="rec-home-primary" href="/rec-scanner">Tera scanner station</Link>
          <Link className="rec-home-secondary" href="/dashboard/rec-conference">Conference desk</Link>
        </div>
        <div className="rec-home-dots" role="tablist" aria-label="Conference photos">
          {SLIDES.map((slide, slideIndex) => (
            <button
              key={slide.src}
              type="button"
              role="tab"
              aria-selected={slideIndex === index}
              aria-label={slide.alt}
              className={slideIndex === index ? "is-active" : ""}
              onClick={() => chooseSlide(slideIndex)}
            />
          ))}
        </div>
      </section>
    </main>
  )
}
