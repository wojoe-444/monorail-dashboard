import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

interface SaveViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName: string
  initialDescription?: string
  initialPinned?: boolean
  /** Editing an existing view: offer "Save as new" too. */
  existing: boolean
  onSave: (input: { name: string; description: string; pinned: boolean; asNew: boolean }) => void
}

export function SaveViewDialog({ open, onOpenChange, initialName, initialDescription = '', initialPinned = true, existing, onSave }: SaveViewDialogProps) {
  const id = useId()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [pinned, setPinned] = useState(initialPinned)
  const submit = (asNew: boolean) => {
    if (!name.trim()) return
    onSave({ name: name.trim(), description: description.trim(), pinned, asNew })
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Save view' : 'Save as a view'}</DialogTitle>
          <DialogDescription>Views are saved in this browser. To share one with the team, copy its saved-query YAML into the dbt project.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit(false)
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-desc`}>Description</Label>
            <Textarea id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What question does this answer?" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor={`${id}-pin`} className="flex flex-col items-start gap-1">
              Pin to My board
              <span className="text-xs font-normal text-muted-foreground">Show it as a card on your board.</span>
            </Label>
            <Switch id={`${id}-pin`} checked={pinned} onCheckedChange={setPinned} />
          </div>
          <DialogFooter>
            {existing && (
              <Button type="button" variant="outline" onClick={() => submit(true)}>
                Save as new
              </Button>
            )}
            <Button type="submit">{existing ? 'Save changes' : 'Save view'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
