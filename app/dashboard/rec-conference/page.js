"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowRight,
  faCalendar,
  faChartLine,
  faCog,
  faExternalLinkAlt,
  faFileLines,
  faList,
  faPhotoFilm,
  faQrcode,
  faSpinner,
  faTicket,
  faUserShield,
  faUsers,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getActiveRecConference, getAllRecConferences } from "@/lib/appwrite/rec-conferences"
import { getRegistrationStats } from "@/lib/appwrite/rec-registrations"
import { getRecCouponAnalytics } from "@/lib/appwrite/rec-coupons"
import { getProgramsByConference } from "@/lib/appwrite/rec-programmes"
import { formatAppwriteDate } from "@/lib/utils"
import "./rec-dashboard.css"

const emptySummary = {
  conferences: 0,
  registrations: 0,
  attendees: 0,
  exhibitors: 0,
  sponsors: 0,
  activeCoupons: 0,
  couponSeatsLeft: 0,
  programs: 0,
  publishedPrograms: 0,
}

function getRegistrationMode(conference) {
  if (!conference) {
    return {
      label: "No active conference",
      tone: "neutral",
      description: "Configure and activate a conference before opening operations.",
    }
  }

  if (!conference.registrationOpen) {
    return {
      label: "Registration closed",
      tone: "closed",
      description: conference.regClosedMessage || "Public registration is closed.",
    }
  }

  if (conference.couponRequired) {
    return {
      label: "Coupon holders only",
      tone: "warning",
      description: "Registration is open, but a coupon is required for new seats.",
    }
  }

  return {
    label: "Public registration open",
    tone: "open",
    description: "Registration is open and coupons are optional.",
  }
}

function AccessRestricted() {
  return (
    <div className="rec-dashboard-container">
      <div className="rec-access-wrap">
        <div className="rec-alert text-center">
          <FontAwesomeIcon icon={faUserShield} size="3x" className="mb-4" style={{ color: "#dc3545" }} />
          <h4 className="rec-alert-title">Access Restricted</h4>
          <p>You do not have permission to access the REC Conference module.</p>
          <p className="mb-0 mt-3">
            <small style={{ color: "#64748b" }}>Please contact your administrator to request access.</small>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function RecConferencePage() {
  const router = useRouter()
  const appwriteServices = useAppwrite()
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES,
  } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeConference, setActiveConference] = useState(null)
  const [summary, setSummary] = useState(emptySummary)

  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "manage")
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "edit")
  const canViewRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "view")
  const isSenior = isSeniorManager()
  const canConfigure = canManageRec || isSenior
  const canOperate = canEditRec || canConfigure
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)
  const registrationMode = getRegistrationMode(activeConference)

  useEffect(() => {
    if (!appwriteServices || (!hasRecAccess && !isSenior)) return

    let isMounted = true

    const loadDashboard = async () => {
      setLoading(true)
      setError("")

      try {
        const [active, allConferences] = await Promise.all([
          getActiveRecConference(appwriteServices),
          getAllRecConferences(appwriteServices),
        ])

        let registrationStats = null
        let couponAnalytics = null
        let programs = { documents: [] }

        if (active) {
          const results = await Promise.allSettled([
            getRegistrationStats(active.year, appwriteServices),
            getRecCouponAnalytics(active.year, appwriteServices),
            getProgramsByConference(active.$id, appwriteServices),
          ])

          registrationStats = results[0].status === "fulfilled" ? results[0].value : null
          couponAnalytics = results[1].status === "fulfilled" ? results[1].value : null
          programs = results[2].status === "fulfilled" ? results[2].value : programs
        }

        if (!isMounted) return

        setActiveConference(active)
        setSummary({
          conferences: allConferences.documents?.length || 0,
          registrations: registrationStats?.total || 0,
          attendees: registrationStats?.byType?.attendee || 0,
          exhibitors: registrationStats?.byType?.exhibitor || 0,
          sponsors: registrationStats?.byType?.sponsor || 0,
          activeCoupons: couponAnalytics?.active || 0,
          couponSeatsLeft: couponAnalytics?.usersLeft || 0,
          programs: programs.documents?.length || 0,
          publishedPrograms: programs.documents?.filter((program) => program.status === "PUBLISHED").length || 0,
        })
      } catch (err) {
        console.error("Error loading REC dashboard:", err)
        if (isMounted) {
          setError("Unable to load the REC conference overview. Please refresh and try again.")
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadDashboard()

    return () => {
      isMounted = false
    }
  }, [appwriteServices, hasRecAccess, isSenior])

  const actionCards = useMemo(() => {
    const cards = []

    if (canOperate) {
      cards.push({
        title: "Registrations",
        description: "Add, edit, review, and export registrants for the active conference.",
        icon: faUsers,
        tone: "success",
        href: "/dashboard/rec-conference/admin/registrations",
        cta: "Open registrations",
        meta: `${summary.registrations} total`,
        primary: true,
      })
    }

    if (canConfigure) {
      cards.push(
        {
          title: "Programs",
          description: "Manage program schedules, sessions, halls, time blocks, and timetable exports.",
          icon: faList,
          tone: "dark",
          href: "/dashboard/rec-conference/admin/programs",
          cta: "Manage programs",
          meta: `${summary.publishedPrograms}/${summary.programs} published`,
        },
        {
          title: "Coupons",
          description: "Create coupon allocations and monitor remaining coupon-holder seats.",
          icon: faTicket,
          tone: "accent",
          href: "/dashboard/rec-conference/admin/coupons",
          cta: "Manage coupons",
          meta: `${summary.activeCoupons} active`,
        },
        {
          title: "QR Scanning",
          description: "Configure badge scan events, scanner operators, lunch checks, session access, and attendance analytics.",
          icon: faQrcode,
          tone: "success",
          href: "/dashboard/rec-conference/admin/scanning",
          cta: "Manage scanning",
          meta: "Badges & attendance",
        },
        {
          title: "Media Library",
          description: "Curate public image albums, sample photos, and conference video links for each REC edition.",
          icon: faPhotoFilm,
          tone: "accent",
          href: "/dashboard/rec-conference/admin/media",
          cta: "Manage media",
          meta: "Albums & videos",
        },
        {
          title: "Conference Reports",
          description: "Publish official report and proceedings links for completed REC editions.",
          icon: faFileLines,
          tone: "dark",
          href: "/dashboard/rec-conference/admin/reports",
          cta: "Manage reports",
          meta: "Previous editions",
        },
        {
          title: "Conference Setup",
          description: "Configure active conference details, dates, venue, limits, registration mode, and public content.",
          icon: faCog,
          tone: "primary",
          href: "/dashboard/rec-conference/admin/conferences",
          cta: "Open setup",
          meta: `${summary.conferences} configured`,
        },
        {
          title: "Access Control",
          description: "Grant or remove REC module permissions for staff members.",
          icon: faUserShield,
          tone: "neutral",
          href: "/dashboard/rec-conference/admin/permissions",
          cta: "Manage access",
          meta: userPermissionLevel ? `${userPermissionLevel} access` : "Permissioned",
        }
      )
    }

    return cards
  }, [canConfigure, canOperate, summary, userPermissionLevel])

  if (!hasRecAccess && !isSenior) {
    return <AccessRestricted />
  }

  return (
    <div className="rec-dashboard-container">
      <div className="rec-dashboard-shell">
        <section className="rec-overview-hero">
          <div className="rec-overview-hero-content">
            <div className="rec-overview-kicker">
              <FontAwesomeIcon icon={faCalendar} />
              Renewable Energy Conference & Expo
            </div>
            <h1>REC Conference Operations</h1>
            <p>
              Monitor the active conference and move quickly into the operational area you need.
              Configuration now lives in its own setup workspace.
            </p>
            <div className="rec-hero-actions">
              {canOperate && (
                <button
                  type="button"
                  className="rec-btn rec-btn-primary"
                  onClick={() => router.push("/dashboard/rec-conference/admin/registrations")}
                >
                  <FontAwesomeIcon icon={faUsers} />
                  Registrations
                </button>
              )}
              {canConfigure && (
                <button
                  type="button"
                  className="rec-btn rec-btn-outline rec-btn-light"
                  onClick={() => router.push("/dashboard/rec-conference/admin/conferences")}
                >
                  <FontAwesomeIcon icon={faCog} />
                  Conference setup
                </button>
              )}
            </div>
          </div>

          <div className="rec-active-card">
            <div className="rec-active-card-header">
              <span>Active Conference</span>
              {userPermissionLevel && (
                <span className="rec-permission-badge">
                  <FontAwesomeIcon icon={faUserShield} /> {userPermissionLevel}
                </span>
              )}
            </div>
            {loading ? (
              <div className="rec-overview-loading">
                <FontAwesomeIcon icon={faSpinner} spin />
                Loading overview...
              </div>
            ) : activeConference ? (
              <>
                <h2>{activeConference.title || `REC ${activeConference.year}`}</h2>
                <div className={`rec-mode-pill rec-mode-${registrationMode.tone}`}>
                  {registrationMode.label}
                </div>
                <p>{registrationMode.description}</p>
                <div className="rec-active-meta">
                  <span>
                    <strong>{activeConference.year}</strong>
                    Year
                  </span>
                  <span>
                    <strong>{formatAppwriteDate(activeConference.startDate, "medium")}</strong>
                    Start
                  </span>
                  <span>
                    <strong>{formatAppwriteDate(activeConference.endDate, "medium")}</strong>
                    End
                  </span>
                </div>
              </>
            ) : (
              <>
                <h2>No active conference</h2>
                <div className="rec-mode-pill rec-mode-neutral">Setup required</div>
                <p>Configure a conference and mark it active before managing registrations or public program details.</p>
              </>
            )}
          </div>
        </section>

        {error && (
          <div className="rec-alert rec-alert-danger">
            <h4 className="rec-alert-title">Overview unavailable</h4>
            <p className="mb-0">{error}</p>
          </div>
        )}

        <section className="rec-overview-stats" aria-label="REC conference summary">
          <div className="rec-overview-stat">
            <span className="rec-stat-number">{summary.registrations}</span>
            <span className="rec-stat-label">Registrants</span>
          </div>
          <div className="rec-overview-stat">
            <span className="rec-stat-number">{summary.exhibitors}</span>
            <span className="rec-stat-label">Exhibitors</span>
          </div>
          <div className="rec-overview-stat">
            <span className="rec-stat-number">{summary.couponSeatsLeft}</span>
            <span className="rec-stat-label">Coupon seats left</span>
          </div>
          <div className="rec-overview-stat">
            <span className="rec-stat-number">{summary.publishedPrograms}</span>
            <span className="rec-stat-label">Published programs</span>
          </div>
        </section>

        <section>
          <div className="rec-section-heading">
            <div>
              <h2>Where do you want to go?</h2>
              <p>Select the area you need. The dashboard stays light; detailed work happens in dedicated pages.</p>
            </div>
          </div>

          {actionCards.length > 0 ? (
            <div className="rec-overview-actions">
              {actionCards.map((card) => (
                <button
                  key={card.title}
                  type="button"
                  className={`rec-overview-action-card ${card.primary ? "rec-overview-action-primary" : ""}`}
                  onClick={() => router.push(card.href)}
                >
                  <span className={`rec-icon-wrap rec-icon-${card.tone}`}>
                    <FontAwesomeIcon icon={card.icon} />
                  </span>
                  <span className="rec-overview-action-main">
                    <span className="rec-overview-action-topline">
                      <span className="rec-overview-action-title">{card.title}</span>
                      <span className="rec-overview-action-meta">{card.meta}</span>
                    </span>
                    <span className="rec-overview-action-desc">{card.description}</span>
                    <span className="rec-overview-action-link">
                      {card.cta}
                      <FontAwesomeIcon icon={faArrowRight} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : canViewRec ? (
            <div className="rec-alert">
              <h4 className="rec-alert-title">View-only access</h4>
              <p className="mb-0">
                Your current permissions allow you to view this module. Ask an administrator for edit or manage
                access if you need to update registrations, programs, coupons, or conference setup.
              </p>
            </div>
          ) : (
            <div className="rec-alert">
              <h4 className="rec-alert-title">Limited access</h4>
              <p className="mb-0">For additional REC module access, please contact your system administrator.</p>
            </div>
          )}
        </section>

        <section className="rec-overview-footer-grid">
          <div className="rec-overview-note">
            <FontAwesomeIcon icon={faChartLine} />
            <div>
              <h3>Operational snapshot</h3>
              <p>
                Registrations, coupon seats, and program publication status are summarized from the active conference.
                Use the dedicated pages when you need filtering, exports, or detailed editing.
              </p>
            </div>
          </div>

          {canConfigure && (
            <button
              type="button"
              className="rec-overview-public-link"
              onClick={() => router.push("/dashboard/rec-conference/admin/conferences")}
            >
              <span>
                <strong>Need to change public-facing conference details?</strong>
                <small>Dates, venue, hero content, registration mode, and limits are managed in setup.</small>
              </span>
              <FontAwesomeIcon icon={faExternalLinkAlt} />
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
