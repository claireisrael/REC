export function mergeExhibitorAccess(
  registration,
  conference,
  applications,
  links
) {
  const attendeeAccess = (registration.conferenceYears || [])
    .map(Number)
    .includes(Number(conference.year))
  const daysByType = attendeeAccess
    ? { [registration.registrationType]: registration.daysAttending || [] }
    : {}
  const companies = []
  for (const link of links) {
    const application = applications.find((a) => a.$id === link.applicationId)
    if (
      !link.active ||
      link.conferenceId !== conference.$id ||
      link.registrationId !== registration.$id ||
      application?.status !== "confirmed"
    )
      continue
    const data = JSON.parse(application.dataJson),
      rep = data.representatives.find((r) => r.id === link.representativeId)
    if (!rep || rep.email !== link.email || String(registration.email).toLowerCase() !== rep.email) continue
    daysByType.Exhibitor = [
      ...new Set([...(daysByType.Exhibitor || []), ...rep.days])
    ]
    companies.push({
      applicationId: application.$id,
      name: application.companyName,
      booth: JSON.parse(application.decisionJson || "{}").booth || "",
      sponsorOrganization: JSON.parse(application.admissionJson || "{}").sponsorOrganization || "",
      sponsorSector: JSON.parse(application.admissionJson || "{}").sponsorSector || ""
    })
  }
  const types = Object.keys(daysByType)
  return {
    ...registration,
    conferenceEligible: types.length > 0,
    registrationTypes: types,
    participationDaysByType: daysByType,
    daysAttending: [...new Set(Object.values(daysByType).flat())],
    exhibitorCompanies: companies
  }
}
export function registrationForScanEvent(registration, event) {
  if (
    !registration.participationDaysByType ||
    !event.allowedRegistrationTypes?.length
  )
    return registration
  return {
    ...registration,
    daysAttending: [
      ...new Set(
        event.allowedRegistrationTypes.flatMap(
          (type) => registration.participationDaysByType[type] || []
        )
      )
    ]
  }
}
