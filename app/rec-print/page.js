import { Suspense } from "react"
import RecPrintSheet from "@/components/rec-registration/RecPrintSheet"

export const metadata = {
  title: "Print REC cards",
}

export default function RecPrintPage() {
  return (
    <Suspense fallback={<p className="rec-print-sheet-status">Opening cards…</p>}>
      <RecPrintSheet />
    </Suspense>
  )
}
