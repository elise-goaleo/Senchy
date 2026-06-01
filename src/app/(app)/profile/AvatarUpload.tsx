"use client"

import { useState, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import type { Area } from "react-easy-crop"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { getCroppedImg } from "./cropUtils"
import { Camera, Loader2, CheckCircle2, X, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createPortal } from "react-dom"

const Cropper = dynamic(() => import("react-easy-crop"), { ssr: false })

interface Props {
  userId: string
  avatarUrl: string | null
  initial: string
}

export function AvatarUpload({ avatarUrl: initialAvatarUrl, initial }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [avatarUrl, setAvatarUrl]           = useState(initialAvatarUrl)
  const [imageSrc, setImageSrc]             = useState<string | null>(null)
  const [crop, setCrop]                     = useState({ x: 0, y: 0 })
  const [zoom, setZoom]                     = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isLoading, setIsLoading]           = useState(false)
  const [success, setSuccess]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  // ── File selection ────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected
    e.target.value = ""

    const reader = new FileReader()
    reader.addEventListener("load", () => {
      setImageSrc(reader.result as string)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setError(null)
      setSuccess(false)
    })
    reader.readAsDataURL(file)
  }

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  // ── Confirm crop & upload ─────────────────────────────────────────────────

  async function handleConfirm() {
    if (!imageSrc || !croppedAreaPixels) return
    setIsLoading(true)
    setError(null)

    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, 256)
      const formData = new FormData()
      formData.append("file", blob, "avatar.jpg")

      const res = await fetch("/api/users/avatar", { method: "POST", body: formData })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "Erreur lors de l'upload.")
        return
      }

      const { avatarUrl: newUrl } = await res.json()
      setAvatarUrl(newUrl)
      setSuccess(true)
      setImageSrc(null)
      router.refresh()
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setIsLoading(false)
    }
  }

  function handleCancel() {
    setImageSrc(null)
    setError(null)
  }

  // ── Crop modal ────────────────────────────────────────────────────────────

  const modal = imageSrc ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-slate-900">Recadrer la photo</h2>
          <button
            onClick={handleCancel}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Crop area */}
        <div className="relative w-full" style={{ height: 300, background: "#0f172a" }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={0}
            aspect={1}
            minZoom={1}
            maxZoom={3}
            zoomSpeed={0.1}
            cropShape="round"
            showGrid={false}
            restrictPosition
            style={{}}
            classes={{}}
            mediaProps={{}}
            cropperProps={{}}
            keyboardStep={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
          <ZoomOut className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[#5F7F6F]"
          />
          <ZoomIn className="h-4 w-4 text-slate-400 shrink-0" />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4">
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enregistrement…</>
            ) : (
              "Confirmer"
            )}
          </Button>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  ) : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Avatar with camera overlay */}
      <button
        onClick={() => inputRef.current?.click()}
        className="relative group shrink-0"
        title="Changer la photo de profil"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="Photo de profil"
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#5F7F6F] text-white text-2xl font-bold select-none">
            {success ? <CheckCircle2 className="h-7 w-7" /> : initial}
          </div>
        )}

        {/* Camera overlay */}
        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="h-6 w-6 text-white" />
        </div>
      </button>

      {/* Crop modal via portal */}
      {typeof window !== "undefined" && modal
        ? createPortal(modal, document.body)
        : null}
    </>
  )
}
