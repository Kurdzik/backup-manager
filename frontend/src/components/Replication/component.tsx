"use client"
import { post, get, del, put } from "@/lib/backendRequests"
import { useState, useEffect, useMemo, useCallback } from "react"
import {
    Select,
    MultiSelect,
    Stack,
    Modal,
    TextInput,
    NumberInput,
    Button,
    Group,
    Table,
    Loader,
    ActionIcon,
    Badge,
    Checkbox,
    Center,
    Box,
    Text,
} from "@mantine/core"
import {
    IconEdit,
    IconTrash,
    IconPlus,
    IconRefresh,
    IconPlayerPlay,
    IconArrowRight,
} from "@tabler/icons-react"
import { DisplayNotification } from "../Notifications/component"
import { ProductIcon, DestinationIcon } from "../BrandIcons"
import { ReplicationDiagram } from "./ReplicationDiagram"

interface BackupSource {
    id: number
    source_type: string
    name: string
    url: string
}

interface BackupDestination {
    id: number
    destination_type: string
    name: string
    url: string
}

interface Replication {
    id: number
    name: string
    source_id: number
    target_source_ids: number[]
    destination_id: number
    schedule: string
    keep_n: number
    is_active: boolean
    last_run: string | null
    next_run: string | null
    created_at: string
    updated_at: string
}

interface NotificationState {
    message: string
    statusCode: number
}

const CRON_PRESETS = [
    { value: "*/5 * * * *", label: "Every 5 minutes" },
    { value: "0 * * * *", label: "Every hour" },
    { value: "0 0 * * *", label: "Daily at midnight" },
    { value: "0 0 * * 0", label: "Weekly (Sundays at midnight)" },
    { value: "0 0 1 * *", label: "Monthly (1st at midnight)" },
    { value: "custom", label: "Custom Cron Expression" },
]

// UI-gated to postgres for now; the backend is generic and can accept more types
// once the wizard is opened up.
const REPLICATION_SOURCE_TYPES = ["postgres"]

export function ReplicationManager() {
    const [modalOpened, setModalOpened] = useState(false)
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

    const [replicationName, setReplicationName] = useState<string>("")
    const [sourceId, setSourceId] = useState<string | null>(null)
    const [destinationId, setDestinationId] = useState<string | null>(null)
    const [targetSourceIds, setTargetSourceIds] = useState<string[]>([])
    const [cronExpression, setCronExpression] = useState<string>("*/5 * * * *")
    const [customCron, setCustomCron] = useState<string>("")
    const [isCustomCron, setIsCustomCron] = useState<boolean>(false)
    const [keepN, setKeepN] = useState<number>(3)
    const [isActive, setIsActive] = useState<boolean>(true)

    const [loading, setLoading] = useState(false)
    const [notification, setNotification] = useState<NotificationState | null>(null)
    const [editingId, setEditingId] = useState<number | null>(null)

    const [sources, setSources] = useState<BackupSource[]>([])
    const [destinations, setDestinations] = useState<BackupDestination[]>([])
    const [replications, setReplications] = useState<Replication[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedRowId, setSelectedRowId] = useState<number | null>(null)

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        setNotification(null)
        try {
            const [sourcesRes, destinationsRes, replicationsRes] = await Promise.all([
                get("backup-sources/list"),
                get("backup-destinations/list"),
                get("replications/list"),
            ])

            if (sourcesRes.status >= 400) {
                setNotification({
                    message: sourcesRes.detail || "Failed to fetch backup sources",
                    statusCode: sourcesRes.status,
                })
                setSources([])
            } else {
                setSources(sourcesRes?.data?.backup_sources || [])
            }

            if (destinationsRes.status >= 400) {
                setNotification({
                    message:
                        destinationsRes.detail || "Failed to fetch backup destinations",
                    statusCode: destinationsRes.status,
                })
                setDestinations([])
            } else {
                setDestinations(destinationsRes?.data?.backup_destinations || [])
            }

            if (replicationsRes.status >= 400) {
                setNotification({
                    message:
                        replicationsRes.detail || "Failed to fetch replications",
                    statusCode: replicationsRes.status,
                })
                setReplications([])
            } else {
                const list: Replication[] = replicationsRes?.data?.replications || []
                setReplications(list)
                if (list.length && selectedRowId === null) {
                    setSelectedRowId(list[0].id)
                }
            }
        } catch (err) {
            setNotification({ message: "Failed to load data", statusCode: 500 })
            console.error("Error loading data:", err)
        } finally {
            setIsLoading(false)
        }
    }, [selectedRowId])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const eligibleSources = useMemo(
        () => sources.filter((s) => REPLICATION_SOURCE_TYPES.includes(s.source_type)),
        [sources],
    )

    const sourceOptions = useMemo(
        () =>
            eligibleSources.map((s) => ({
                value: String(s.id),
                label: `${s.name} (${s.source_type})`,
            })),
        [eligibleSources],
    )

    const destinationOptions = useMemo(
        () =>
            destinations.map((d) => ({
                value: String(d.id),
                label: `${d.name} (${d.destination_type})`,
            })),
        [destinations],
    )

    const targetOptions = useMemo(() => {
        if (!sourceId) return []
        const src = sources.find((s) => String(s.id) === sourceId)
        if (!src) return []
        return sources
            .filter(
                (s) => s.source_type === src.source_type && String(s.id) !== sourceId,
            )
            .map((s) => ({
                value: String(s.id),
                label: `${s.name} (${s.source_type})`,
            }))
    }, [sources, sourceId])

    const getSourceName = useCallback(
        (id: number) => sources.find((s) => s.id === id)?.name || `#${id}`,
        [sources],
    )

    const getSourceType = useCallback(
        (id: number) => sources.find((s) => s.id === id)?.source_type || "",
        [sources],
    )

    const getDestinationName = useCallback(
        (id: number) => destinations.find((d) => d.id === id)?.name || `#${id}`,
        [destinations],
    )

    const getDestinationType = useCallback(
        (id: number) =>
            destinations.find((d) => d.id === id)?.destination_type || "",
        [destinations],
    )

    const resetForm = useCallback(() => {
        setStep(1)
        setReplicationName("")
        setSourceId(null)
        setDestinationId(null)
        setTargetSourceIds([])
        setCronExpression("*/5 * * * *")
        setCustomCron("")
        setIsCustomCron(false)
        setKeepN(3)
        setIsActive(true)
    }, [])

    const openAddModal = useCallback(() => {
        setEditingId(null)
        resetForm()
        setModalOpened(true)
    }, [resetForm])

    const openEditModal = useCallback((replication: Replication) => {
        setEditingId(replication.id)
        setStep(1)
        setReplicationName(replication.name)
        setSourceId(String(replication.source_id))
        setDestinationId(String(replication.destination_id))
        setTargetSourceIds(replication.target_source_ids.map(String))
        const isPreset = CRON_PRESETS.some(
            (preset) => preset.value === replication.schedule,
        )
        setIsCustomCron(!isPreset)
        if (isPreset) {
            setCronExpression(replication.schedule)
            setCustomCron("")
        } else {
            setCronExpression("")
            setCustomCron(replication.schedule)
        }
        setKeepN(replication.keep_n)
        setIsActive(replication.is_active)
        setModalOpened(true)
    }, [])

    const finalCron = isCustomCron ? customCron : cronExpression

    const canAdvance = useMemo(() => {
        if (step === 1) return !!sourceId
        if (step === 2) return !!destinationId
        if (step === 3) return targetSourceIds.length > 0
        if (step === 4) return !!finalCron && keepN > 0
        return false
    }, [step, sourceId, destinationId, targetSourceIds, finalCron, keepN])

    const handleSubmit = async () => {
        if (!sourceId || !destinationId || !targetSourceIds.length || !finalCron) {
            setNotification({
                message: "Please complete every step of the wizard",
                statusCode: 400,
            })
            return
        }

        setLoading(true)
        setNotification(null)
        try {
            const commonPayload = {
                name: replicationName || undefined,
                source_id: parseInt(sourceId, 10),
                target_source_ids: targetSourceIds.map((id) => parseInt(id, 10)),
                destination_id: parseInt(destinationId, 10),
                schedule: finalCron,
                keep_n: keepN,
            }

            const response = editingId
                ? await post("replications/update", {
                      replication_id: editingId,
                      is_active: isActive,
                      ...commonPayload,
                  })
                : await post("replications/add", commonPayload)

            if (response.status >= 400) {
                setNotification({
                    message: response.detail || "Failed to save replication",
                    statusCode: response.status,
                })
                return
            }

            setNotification({
                message: response.message || "Replication saved",
                statusCode: response.status,
            })
            setModalOpened(false)
            setEditingId(null)
            resetForm()
            await fetchData()
        } catch (err) {
            setNotification({ message: "Failed to save replication", statusCode: 500 })
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this replication?"))
            return

        setNotification(null)
        try {
            const response = await del(`replications/delete?replication_id=${id}`)
            if (response.status >= 400) {
                setNotification({
                    message: response.detail || "Failed to delete replication",
                    statusCode: response.status,
                })
                return
            }
            setNotification({
                message: response.message || "Replication deleted",
                statusCode: response.status,
            })
            if (selectedRowId === id) setSelectedRowId(null)
            await fetchData()
        } catch (err) {
            setNotification({
                message: "Failed to delete replication",
                statusCode: 500,
            })
            console.error(err)
        }
    }

    const handleRunNow = async (id: number) => {
        setNotification(null)
        try {
            const response = await put(`replications/run?replication_id=${id}`)
            if (response.status >= 400) {
                setNotification({
                    message: response.detail || "Failed to trigger replication",
                    statusCode: response.status,
                })
                return
            }
            setNotification({
                message: response.message || "Replication started",
                statusCode: response.status,
            })
        } catch (err) {
            setNotification({
                message: "Failed to trigger replication",
                statusCode: 500,
            })
            console.error(err)
        }
    }

    const selectedReplication = useMemo(
        () => replications.find((r) => r.id === selectedRowId) || null,
        [replications, selectedRowId],
    )

    const diagramData = useMemo(() => {
        if (!selectedReplication) return null
        const source = sources.find((s) => s.id === selectedReplication.source_id)
        const targets = selectedReplication.target_source_ids
            .map((id) => sources.find((s) => s.id === id))
            .filter((s): s is BackupSource => !!s)
        if (!source) return null
        return { source, targets }
    }, [selectedReplication, sources])

    return (
        <div>
            <Group
                mb={24}
                pb={16}
                style={{ borderBottom: "1px solid var(--lnr-border)" }}
                justify="space-between"
                align="center"
            >
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--lnr-text)" }}>
                    Replication
                </span>
                <Group gap={8}>
                    <ActionIcon
                        onClick={fetchData}
                        loading={isLoading}
                        variant="subtle"
                        color="gray"
                        size="sm"
                    >
                        <IconRefresh size={14} />
                    </ActionIcon>
                    <Button
                        leftSection={<IconPlus size={14} />}
                        onClick={openAddModal}
                        disabled={isLoading}
                        size="xs"
                    >
                        Add Replication
                    </Button>
                </Group>
            </Group>

            {notification && (
                <DisplayNotification
                    message={notification.message}
                    statusCode={notification.statusCode}
                />
            )}

            <Box
                mb={20}
                style={{
                    border: "1px solid var(--lnr-border)",
                    borderRadius: 6,
                    padding: 12,
                    background: "var(--lnr-bg)",
                }}
            >
                <Group justify="space-between" mb={8}>
                    <Text size="sm" fw={600}>
                        Replication topology
                    </Text>
                    {selectedReplication && (
                        <Text size="xs" c="dimmed">
                            {selectedReplication.name}
                        </Text>
                    )}
                </Group>
                <ReplicationDiagram data={diagramData} />
            </Box>

            {isLoading ? (
                <Center py={40}>
                    <Loader />
                </Center>
            ) : (
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Source</Table.Th>
                            <Table.Th>Targets</Table.Th>
                            <Table.Th>Destination</Table.Th>
                            <Table.Th>Schedule</Table.Th>
                            <Table.Th>Retain</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Last Run</Table.Th>
                            <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {replications.length === 0 ? (
                            <Table.Tr>
                                <Table.Td colSpan={9}>
                                    <div
                                        style={{
                                            textAlign: "center",
                                            padding: "32px 0",
                                            color: "var(--lnr-text-faint)",
                                            fontSize: 13,
                                        }}
                                    >
                                        No replications configured
                                    </div>
                                </Table.Td>
                            </Table.Tr>
                        ) : (
                            replications.map((replication) => (
                                <Table.Tr
                                    key={replication.id}
                                    onClick={() => setSelectedRowId(replication.id)}
                                    style={{
                                        cursor: "pointer",
                                        background:
                                            replication.id === selectedRowId
                                                ? "rgba(94, 106, 210, 0.08)"
                                                : undefined,
                                    }}
                                >
                                    <Table.Td>{replication.name || "Unnamed"}</Table.Td>
                                    <Table.Td style={{ fontSize: 12 }}>
                                        <Group gap={6} wrap="nowrap">
                                            <ProductIcon
                                                type={getSourceType(replication.source_id)}
                                                size={14}
                                            />
                                            <span>{getSourceName(replication.source_id)}</span>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td style={{ fontSize: 12 }}>
                                        {replication.target_source_ids
                                            .map((id) => getSourceName(id))
                                            .join(", ")}
                                    </Table.Td>
                                    <Table.Td style={{ fontSize: 12 }}>
                                        <Group gap={6} wrap="nowrap">
                                            <DestinationIcon
                                                type={getDestinationType(
                                                    replication.destination_id,
                                                )}
                                                size={14}
                                            />
                                            <span>
                                                {getDestinationName(replication.destination_id)}
                                            </span>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td
                                        style={{ fontSize: 12, fontFamily: "monospace" }}
                                    >
                                        {replication.schedule}
                                    </Table.Td>
                                    <Table.Td>{replication.keep_n}</Table.Td>
                                    <Table.Td>
                                        <Badge
                                            color={replication.is_active ? "green" : "gray"}
                                        >
                                            {replication.is_active ? "Active" : "Inactive"}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td style={{ fontSize: 12 }}>
                                        {replication.last_run
                                            ? new Date(replication.last_run).toLocaleString()
                                            : "Never"}
                                    </Table.Td>
                                    <Table.Td>
                                        <Group
                                            gap={8}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <ActionIcon
                                                size="sm"
                                                variant="default"
                                                onClick={() => handleRunNow(replication.id)}
                                                title="Run now"
                                            >
                                                <IconPlayerPlay size={16} />
                                            </ActionIcon>
                                            <ActionIcon
                                                size="sm"
                                                variant="default"
                                                onClick={() => openEditModal(replication)}
                                                title="Edit"
                                            >
                                                <IconEdit size={16} />
                                            </ActionIcon>
                                            <ActionIcon
                                                color="red"
                                                variant="subtle"
                                                onClick={() => handleDelete(replication.id)}
                                                title="Delete"
                                            >
                                                <IconTrash size={16} />
                                            </ActionIcon>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))
                        )}
                    </Table.Tbody>
                </Table>
            )}

            <Modal
                opened={modalOpened}
                onClose={() => {
                    setModalOpened(false)
                    setEditingId(null)
                }}
                title={
                    editingId
                        ? `Edit Replication — Step ${step} of 4`
                        : `Add Replication — Step ${step} of 4`
                }
                size="lg"
            >
                <Stack>
                    {step === 1 && (
                        <>
                            <Text size="sm" c="dimmed">
                                Select the primary source that will be replicated. Only
                                Postgres sources are supported for now.
                            </Text>
                            <TextInput
                                label="Replication Name (Optional)"
                                value={replicationName}
                                onChange={(e) =>
                                    setReplicationName(e.currentTarget.value)
                                }
                                placeholder="e.g., Primary → Followers"
                            />
                            <Select
                                label="Source"
                                placeholder="Select a source"
                                data={sourceOptions}
                                value={sourceId}
                                onChange={(value) => {
                                    setSourceId(value)
                                    setTargetSourceIds([])
                                }}
                                searchable
                                required
                                renderOption={({ option }) => {
                                    const src = eligibleSources.find(
                                        (s) => String(s.id) === option.value,
                                    )
                                    return (
                                        <Group gap={8} wrap="nowrap">
                                            <ProductIcon
                                                type={src?.source_type || ""}
                                                size={16}
                                            />
                                            <span>{option.label}</span>
                                        </Group>
                                    )
                                }}
                            />
                            {eligibleSources.length === 0 && (
                                <Text size="xs" c="red">
                                    No eligible sources found. Register a Postgres source
                                    first.
                                </Text>
                            )}
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Text size="sm" c="dimmed">
                                Choose where the intermediate backup will be stored. It
                                will appear in Manage Backups like any other scheduled
                                backup.
                            </Text>
                            <Select
                                label="Destination"
                                placeholder="Select a destination"
                                data={destinationOptions}
                                value={destinationId}
                                onChange={setDestinationId}
                                searchable
                                required
                                renderOption={({ option }) => {
                                    const dest = destinations.find(
                                        (d) => String(d.id) === option.value,
                                    )
                                    return (
                                        <Group gap={8} wrap="nowrap">
                                            <DestinationIcon
                                                type={dest?.destination_type || ""}
                                                size={16}
                                            />
                                            <span>{option.label}</span>
                                        </Group>
                                    )
                                }}
                            />
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Text size="sm" c="dimmed">
                                Select one or more replication targets. Only sources of
                                the same type as the primary are eligible.
                            </Text>
                            <MultiSelect
                                label="Targets"
                                placeholder="Select target sources"
                                data={targetOptions}
                                value={targetSourceIds}
                                onChange={setTargetSourceIds}
                                searchable
                                required
                            />
                            {targetOptions.length === 0 && (
                                <Text size="xs" c="red">
                                    No eligible targets. Register at least one additional
                                    source of the same type as the primary.
                                </Text>
                            )}
                        </>
                    )}

                    {step === 4 && (
                        <>
                            <Text size="sm" c="dimmed">
                                Pick when the replication should run and how many past
                                backups to retain.
                            </Text>
                            <Select
                                label="Schedule"
                                placeholder="Select a schedule"
                                data={CRON_PRESETS}
                                value={isCustomCron ? "custom" : cronExpression}
                                onChange={(value) => {
                                    if (value === "custom") {
                                        setIsCustomCron(true)
                                    } else if (value) {
                                        setIsCustomCron(false)
                                        setCronExpression(value)
                                    }
                                }}
                                searchable
                                required
                            />
                            {isCustomCron && (
                                <TextInput
                                    label="Custom Cron Expression"
                                    value={customCron}
                                    onChange={(e) =>
                                        setCustomCron(e.currentTarget.value)
                                    }
                                    placeholder="*/5 * * * *"
                                    description="Standard 5-field cron syntax"
                                    required
                                />
                            )}
                            <NumberInput
                                label="Retain Backups"
                                value={keepN}
                                onChange={(value) =>
                                    setKeepN(typeof value === "number" ? value : 3)
                                }
                                min={1}
                                description="Number of past backups to keep at the destination"
                                required
                            />
                            {editingId && (
                                <Checkbox
                                    label="Active"
                                    checked={isActive}
                                    onChange={(e) =>
                                        setIsActive(e.currentTarget.checked)
                                    }
                                    description="Enable or disable this replication"
                                />
                            )}
                        </>
                    )}

                    <Group mt={20} justify="space-between">
                        <Button
                            variant="default"
                            onClick={() => {
                                setModalOpened(false)
                                setEditingId(null)
                            }}
                        >
                            Cancel
                        </Button>
                        <Group gap={8}>
                            {step > 1 && (
                                <Button
                                    variant="default"
                                    onClick={() =>
                                        setStep((step - 1) as 1 | 2 | 3 | 4)
                                    }
                                >
                                    Back
                                </Button>
                            )}
                            {step < 4 && (
                                <Button
                                    onClick={() =>
                                        setStep((step + 1) as 1 | 2 | 3 | 4)
                                    }
                                    disabled={!canAdvance}
                                    rightSection={<IconArrowRight size={14} />}
                                >
                                    Next
                                </Button>
                            )}
                            {step === 4 && (
                                <Button
                                    onClick={handleSubmit}
                                    loading={loading}
                                    disabled={!canAdvance}
                                >
                                    {editingId ? "Update" : "Create"} Replication
                                </Button>
                            )}
                        </Group>
                    </Group>
                </Stack>
            </Modal>
        </div>
    )
}
