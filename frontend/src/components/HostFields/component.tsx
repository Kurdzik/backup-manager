"use client"
import { Group, NumberInput, Select, TextInput } from "@mantine/core"

export type ProtocolOption = { value: string; label: string }

export interface HostFieldsProps {
    protocols: ProtocolOption[]
    protocol: string
    host: string
    port: number | undefined
    onProtocolChange: (protocol: string) => void
    onHostChange: (host: string) => void
    onPortChange: (port: number | undefined) => void
    hostPlaceholder?: string
    portPlaceholder?: number
    portRequired?: boolean
}

export function HostFields({
    protocols,
    protocol,
    host,
    port,
    onProtocolChange,
    onHostChange,
    onPortChange,
    hostPlaceholder = "localhost",
    portPlaceholder,
    portRequired = true,
}: HostFieldsProps) {
    return (
        <Group grow align="flex-end">
            <Select
                label="Protocol"
                data={protocols}
                value={protocol}
                onChange={(v) => v && onProtocolChange(v)}
                allowDeselect={false}
                required
            />
            <TextInput
                label="Host"
                value={host}
                onChange={(e) => onHostChange(e.currentTarget.value)}
                placeholder={hostPlaceholder}
                required
            />
            <NumberInput
                label="Port"
                value={port ?? ""}
                onChange={(v) => onPortChange(typeof v === "number" ? v : undefined)}
                placeholder={portPlaceholder?.toString()}
                required={portRequired}
                hideControls
                min={1}
                max={65535}
            />
        </Group>
    )
}

// Best-effort parse of a stored URL back into { protocol, host, port } so the
// edit form can pre-populate. Falls back to `fallback` when the URL is empty
// or unparseable.
export function parseHostUrl(
    url: string | undefined | null,
    allowedProtocols: string[],
    fallback: { protocol: string; host?: string; port?: number },
): { protocol: string; host: string; port: number | undefined } {
    const fbHost = fallback.host ?? ""
    const fbPort = fallback.port
    if (!url) {
        return { protocol: fallback.protocol, host: fbHost, port: fbPort }
    }
    const withProto = url.match(/^([a-z][a-z0-9+.-]*):\/\/([^/:?#]+)(?::(\d+))?/i)
    if (withProto) {
        const [, proto, host, port] = withProto
        const normalizedProto = allowedProtocols.includes(proto) ? proto : fallback.protocol
        return {
            protocol: normalizedProto,
            host,
            port: port ? parseInt(port) : fbPort,
        }
    }
    // "//host/share" (SMB short form)
    const smbShort = url.match(/^\/\/([^/:?#]+)(?::(\d+))?/)
    if (smbShort) {
        const [, host, port] = smbShort
        return {
            protocol: fallback.protocol,
            host,
            port: port ? parseInt(port) : fbPort,
        }
    }
    // Bare "host:port"
    const bare = url.match(/^([^/:?#]+)(?::(\d+))?/)
    if (bare) {
        const [, host, port] = bare
        return {
            protocol: fallback.protocol,
            host,
            port: port ? parseInt(port) : fbPort,
        }
    }
    return { protocol: fallback.protocol, host: fbHost, port: fbPort }
}

// Build "proto://host[:port]" — omits port when undefined, so callers can
// choose whether to require it.
export function buildHostUrl(protocol: string, host: string, port: number | undefined): string {
    if (!host) return ""
    return port ? `${protocol}://${host}:${port}` : `${protocol}://${host}`
}
