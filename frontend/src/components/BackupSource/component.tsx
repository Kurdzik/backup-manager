"use client"
import { post, get, del } from "@/lib/backendRequests"
import { useState, useEffect, useCallback } from "react"
import {
    Select,
    Stack,
    Modal,
    TextInput,
    Button,
    Group,
    Table,
    Loader,
    ActionIcon,
    Tabs
} from "@mantine/core"
import {
    IconEdit,
    IconTrash,
    IconPlus,
    IconRefresh,
    IconCheck
} from "@tabler/icons-react"
import { ProductIcon } from "@/components/BrandIcons"
import { DisplayNotification } from "../Notifications/component"
import { HostFields, ProtocolOption, buildHostUrl, parseHostUrl } from "@/components/HostFields/component"

const HTTP_PROTOCOLS: ProtocolOption[] = [
    { value: "http", label: "http://" },
    { value: "https", label: "https://" },
]
const POSTGRES_PROTOCOLS: ProtocolOption[] = [
    { value: "postgres", label: "postgres://" },
    { value: "postgresql", label: "postgresql://" },
]
const MYSQL_PROTOCOLS: ProtocolOption[] = [{ value: "mysql", label: "mysql://" }]
const MONGODB_PROTOCOLS: ProtocolOption[] = [
    { value: "mongodb", label: "mongodb://" },
    { value: "mongodb+srv", label: "mongodb+srv://" },
]
const NEO4J_PROTOCOLS: ProtocolOption[] = [
    { value: "bolt", label: "bolt://" },
    { value: "neo4j", label: "neo4j://" },
    { value: "bolt+s", label: "bolt+s://" },
    { value: "neo4j+s", label: "neo4j+s://" },
]

const SOURCE_TYPES = ["postgres", "elasticsearch", "vault", "qdrant", "mysql", "mongodb", "minio", "neo4j"]
const SOURCE_LABELS: Record<string, string> = {
    postgres: "PostgreSQL",
    elasticsearch: "Elasticsearch",
    vault: "Vault",
    qdrant: "Qdrant",
    mysql: "MySQL",
    mongodb: "MongoDB",
    minio: "MinIO",
    neo4j: "Neo4j"
}
const SOURCE_OPTIONS = SOURCE_TYPES.map((type) => ({ value: type, label: SOURCE_LABELS[type] }))

const VERSION_OPTIONS: Record<string, { value: string; label: string }[]> = {
    postgres: [
        { value: "12", label: "PostgreSQL 12" },
        { value: "13", label: "PostgreSQL 13" },
        { value: "14", label: "PostgreSQL 14" },
        { value: "15", label: "PostgreSQL 15" },
        { value: "16", label: "PostgreSQL 16" },
        { value: "17", label: "PostgreSQL 17" },
    ],
    elasticsearch: [
        { value: "7.x", label: "Elasticsearch 7.x" },
        { value: "8.x", label: "Elasticsearch 8.x" },
        { value: "9.x", label: "Elasticsearch 9.x" },
    ],
    qdrant: [
        { value: "1.7+", label: "Qdrant 1.7+" },
        { value: "1.12+", label: "Qdrant 1.12+" },
        { value: "1.16+", label: "Qdrant 1.16+" },
    ],
    mongodb: [
        { value: "4.0", label: "MongoDB 4.0" },
        { value: "5.0", label: "MongoDB 5.0" },
        { value: "6.0", label: "MongoDB 6.0" },
        { value: "7.0", label: "MongoDB 7.0" },
        { value: "8.0", label: "MongoDB 8.0" },
    ],
    mysql: [
        { value: "5.7", label: "MySQL 5.7" },
        { value: "8.0", label: "MySQL 8.0" },
        { value: "8.4", label: "MySQL 8.4" },
        { value: "mariadb-10.x", label: "MariaDB 10.x" },
        { value: "mariadb-11.x", label: "MariaDB 11.x" },
    ],
    neo4j: [{ value: "5.x", label: "Neo4j 5.x (5.13+)" }],
    minio: [{ value: "any", label: "Any (S3-compatible)" }],
    vault: [{ value: "1.x", label: "Vault 1.x" }],
}

interface Credentials {
    url: string
    login?: string | null  // Changed from 'username' to 'login' to match backend
    password?: string | null
    apiKey?: string | null  // Changed from 'api_key' to 'apiKey' (camelCase)
}

interface BackupSource {
    id: number
    source_type: string
    name: string
    url: string
    login?: string | null
    password?: string | null
    api_key?: string | null
    version?: string | null
    created_at: string
    updated_at: string
}

interface NotificationState {
    message: string
    statusCode: number
}


interface CredentialComponentProps {
    onCredentialsChange: (credentials: Credentials) => void
    initialValues: BackupSource | null
}

function ExportPostgresCredentials({ onCredentialsChange, initialValues }: CredentialComponentProps) {
    const [protocol, setProtocol] = useState("postgres")
    const [host, setHost] = useState("localhost")
    const [port, setPort] = useState<number | undefined>(5432)
    const [database, setDatabase] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")

    useEffect(() => {
        if (!initialValues) {
            setProtocol("postgres"); setHost("localhost"); setPort(5432)
            setDatabase(""); setUsername(""); setPassword("")
            return
        }
        const parsed = parseHostUrl(initialValues.url, ["postgres", "postgresql"], {
            protocol: "postgres", host: "localhost", port: 5432,
        })
        setProtocol(parsed.protocol); setHost(parsed.host); setPort(parsed.port)
        const dbMatch = initialValues.url?.match(/\/\/[^/]+\/([^?]+)/)
        setDatabase(dbMatch?.[1] ?? "")
        setUsername(initialValues.login || "")
        setPassword("")
    }, [initialValues])

    useEffect(() => {
        const base = buildHostUrl(protocol, host, port)
        onCredentialsChange({
            url: base && database ? `${base}/${database}` : "",
            login: username || null,
            password: password || null,
            apiKey: null,
        })
    }, [protocol, host, port, database, username, password, onCredentialsChange])

    return (
        <Stack>
            <HostFields
                protocols={POSTGRES_PROTOCOLS}
                protocol={protocol}
                host={host}
                port={port}
                onProtocolChange={setProtocol}
                onHostChange={setHost}
                onPortChange={setPort}
            />
            <TextInput label="Database" value={database}
                onChange={(e) => setDatabase(e.currentTarget.value)} required />
            <TextInput label="Username" value={username}
                onChange={(e) => setUsername(e.currentTarget.value)} required />
            <TextInput type="password" label="Password" value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""}
                required={!initialValues} />
        </Stack>
    )
}

function ExportQdrantCredentials({ onCredentialsChange, initialValues }: CredentialComponentProps) {
    const [protocol, setProtocol] = useState("http")
    const [host, setHost] = useState("localhost")
    const [port, setPort] = useState<number | undefined>(6333)
    const [apiKey, setApiKey] = useState("")

    useEffect(() => {
        if (!initialValues) {
            setProtocol("http"); setHost("localhost"); setPort(6333); setApiKey("")
            return
        }
        const parsed = parseHostUrl(initialValues.url, ["http", "https"], {
            protocol: "http", host: "localhost", port: 6333,
        })
        setProtocol(parsed.protocol); setHost(parsed.host); setPort(parsed.port)
        setApiKey("")
    }, [initialValues])

    useEffect(() => {
        onCredentialsChange({
            url: buildHostUrl(protocol, host, port),
            login: null,
            password: null,
            apiKey: apiKey || null,
        })
    }, [protocol, host, port, apiKey, onCredentialsChange])

    return (
        <Stack>
            <HostFields
                protocols={HTTP_PROTOCOLS}
                protocol={protocol}
                host={host}
                port={port}
                onProtocolChange={setProtocol}
                onHostChange={setHost}
                onPortChange={setPort}
            />
            <TextInput label="API Key (optional)" value={apiKey}
                onChange={(e) => setApiKey(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""} />
        </Stack>
    )
}

function ExportElasticsearchCredentials({ onCredentialsChange, initialValues }: CredentialComponentProps) {
    const [protocol, setProtocol] = useState("http")
    const [host, setHost] = useState("localhost")
    const [port, setPort] = useState<number | undefined>(9200)
    const [apiKey, setApiKey] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")

    useEffect(() => {
        if (!initialValues) {
            setProtocol("http"); setHost("localhost"); setPort(9200)
            setApiKey(""); setUsername(""); setPassword("")
            return
        }
        const parsed = parseHostUrl(initialValues.url, ["http", "https"], {
            protocol: "http", host: "localhost", port: 9200,
        })
        setProtocol(parsed.protocol); setHost(parsed.host); setPort(parsed.port)
        setApiKey(""); setUsername(initialValues.login || ""); setPassword("")
    }, [initialValues])

    useEffect(() => {
        onCredentialsChange({
            url: buildHostUrl(protocol, host, port),
            login: username || null,
            password: password || null,
            apiKey: apiKey || null,
        })
    }, [protocol, host, port, username, password, apiKey, onCredentialsChange])

    return (
        <Stack>
            <HostFields
                protocols={HTTP_PROTOCOLS}
                protocol={protocol}
                host={host}
                port={port}
                onProtocolChange={setProtocol}
                onHostChange={setHost}
                onPortChange={setPort}
            />
            <TextInput label="API Key" value={apiKey}
                onChange={(e) => setApiKey(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""} />
            <TextInput label="Username" value={username}
                onChange={(e) => setUsername(e.currentTarget.value)} />
            <TextInput type="password" label="Password" value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""} />
        </Stack>
    )
}

function ExportVaultCredentials({ onCredentialsChange, initialValues }: CredentialComponentProps) {
    const [protocol, setProtocol] = useState("http")
    const [host, setHost] = useState("localhost")
    const [port, setPort] = useState<number | undefined>(8200)
    const [apiKey, setApiKey] = useState("")

    useEffect(() => {
        if (!initialValues) {
            setProtocol("http"); setHost("localhost"); setPort(8200); setApiKey("")
            return
        }
        const parsed = parseHostUrl(initialValues.url, ["http", "https"], {
            protocol: "http", host: "localhost", port: 8200,
        })
        setProtocol(parsed.protocol); setHost(parsed.host); setPort(parsed.port)
        setApiKey("")
    }, [initialValues])

    useEffect(() => {
        onCredentialsChange({
            url: buildHostUrl(protocol, host, port),
            login: null,
            password: null,
            apiKey: apiKey || null,
        })
    }, [protocol, host, port, apiKey, onCredentialsChange])

    return (
        <Stack>
            <HostFields
                protocols={HTTP_PROTOCOLS}
                protocol={protocol}
                host={host}
                port={port}
                onProtocolChange={setProtocol}
                onHostChange={setHost}
                onPortChange={setPort}
            />
            <TextInput label="API Key" value={apiKey}
                onChange={(e) => setApiKey(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""}
                required={!initialValues} />
        </Stack>
    )
}

function ExportMySQLCredentials({ onCredentialsChange, initialValues }: CredentialComponentProps) {
    const [protocol, setProtocol] = useState("mysql")
    const [host, setHost] = useState("localhost")
    const [port, setPort] = useState<number | undefined>(3306)
    const [database, setDatabase] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")

    useEffect(() => {
        if (!initialValues) {
            setProtocol("mysql"); setHost("localhost"); setPort(3306)
            setDatabase(""); setUsername(""); setPassword("")
            return
        }
        const parsed = parseHostUrl(initialValues.url, ["mysql"], {
            protocol: "mysql", host: "localhost", port: 3306,
        })
        setProtocol(parsed.protocol); setHost(parsed.host); setPort(parsed.port)
        const dbMatch = initialValues.url?.match(/\/\/[^/]+\/([^?]+)/)
        setDatabase(dbMatch?.[1] ?? "")
        setUsername(initialValues.login || "")
        setPassword("")
    }, [initialValues])

    useEffect(() => {
        const base = buildHostUrl(protocol, host, port)
        onCredentialsChange({
            url: base ? (database ? `${base}/${database}` : base) : "",
            login: username || null,
            password: password || null,
            apiKey: null,
        })
    }, [protocol, host, port, database, username, password, onCredentialsChange])

    return (
        <Stack>
            <HostFields
                protocols={MYSQL_PROTOCOLS}
                protocol={protocol}
                host={host}
                port={port}
                onProtocolChange={setProtocol}
                onHostChange={setHost}
                onPortChange={setPort}
            />
            <TextInput label="Database" value={database}
                onChange={(e) => setDatabase(e.currentTarget.value)} />
            <TextInput label="Username" value={username}
                onChange={(e) => setUsername(e.currentTarget.value)} required />
            <TextInput type="password" label="Password" value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""}
                required={!initialValues} />
        </Stack>
    )
}

function ExportMongoDBCredentials({ onCredentialsChange, initialValues }: CredentialComponentProps) {
    const [protocol, setProtocol] = useState("mongodb")
    const [host, setHost] = useState("localhost")
    const [port, setPort] = useState<number | undefined>(27017)
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")

    useEffect(() => {
        if (!initialValues) {
            setProtocol("mongodb"); setHost("localhost"); setPort(27017)
            setUsername(""); setPassword("")
            return
        }
        const parsed = parseHostUrl(initialValues.url, ["mongodb", "mongodb+srv"], {
            protocol: "mongodb", host: "localhost", port: 27017,
        })
        setProtocol(parsed.protocol); setHost(parsed.host); setPort(parsed.port)
        setUsername(initialValues.login || "")
        setPassword("")
    }, [initialValues])

    useEffect(() => {
        onCredentialsChange({
            url: buildHostUrl(protocol, host, port),
            login: username || null,
            password: password || null,
            apiKey: null,
        })
    }, [protocol, host, port, username, password, onCredentialsChange])

    return (
        <Stack>
            <HostFields
                protocols={MONGODB_PROTOCOLS}
                protocol={protocol}
                host={host}
                port={port}
                onProtocolChange={setProtocol}
                onHostChange={setHost}
                onPortChange={setPort}
            />
            <TextInput label="Username (optional)" value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""} />
            <TextInput type="password" label="Password (optional)" value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""} />
        </Stack>
    )
}

function ExportNeo4jCredentials({ onCredentialsChange, initialValues }: CredentialComponentProps) {
    const [protocol, setProtocol] = useState("bolt")
    const [host, setHost] = useState("localhost")
    const [port, setPort] = useState<number | undefined>(7687)
    const [database, setDatabase] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")

    useEffect(() => {
        if (!initialValues) {
            setProtocol("bolt"); setHost("localhost"); setPort(7687)
            setDatabase(""); setUsername(""); setPassword("")
            return
        }
        const parsed = parseHostUrl(
            initialValues.url,
            ["bolt", "neo4j", "bolt+s", "neo4j+s"],
            { protocol: "bolt", host: "localhost", port: 7687 },
        )
        setProtocol(parsed.protocol); setHost(parsed.host); setPort(parsed.port)
        const dbMatch = initialValues.url?.match(/\/\/[^/]+\/([^?]+)/)
        setDatabase(dbMatch?.[1] ?? "")
        setUsername(initialValues.login || "")
        setPassword("")
    }, [initialValues])

    useEffect(() => {
        const base = buildHostUrl(protocol, host, port)
        onCredentialsChange({
            url: base ? (database ? `${base}/${database}` : base) : "",
            login: username || null,
            password: password || null,
            apiKey: null,
        })
    }, [protocol, host, port, database, username, password, onCredentialsChange])

    return (
        <Stack>
            <HostFields
                protocols={NEO4J_PROTOCOLS}
                protocol={protocol}
                host={host}
                port={port}
                onProtocolChange={setProtocol}
                onHostChange={setHost}
                onPortChange={setPort}
            />
            <TextInput label="Database (optional)" value={database}
                onChange={(e) => setDatabase(e.currentTarget.value)} placeholder="neo4j" />
            <TextInput label="Username" value={username}
                onChange={(e) => setUsername(e.currentTarget.value)} required />
            <TextInput type="password" label="Password" value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""}
                required={!initialValues} />
        </Stack>
    )
}

function ExportMinIOCredentials({ onCredentialsChange, initialValues }: CredentialComponentProps) {
    const [protocol, setProtocol] = useState("http")
    const [host, setHost] = useState("localhost")
    const [port, setPort] = useState<number | undefined>(9000)
    const [accessKey, setAccessKey] = useState("")
    const [secretKey, setSecretKey] = useState("")

    useEffect(() => {
        if (!initialValues) {
            setProtocol("http"); setHost("localhost"); setPort(9000)
            setAccessKey(""); setSecretKey("")
            return
        }
        const parsed = parseHostUrl(initialValues.url, ["http", "https"], {
            protocol: "http", host: "localhost", port: 9000,
        })
        setProtocol(parsed.protocol); setHost(parsed.host); setPort(parsed.port)
        setAccessKey(initialValues.login || "")
        setSecretKey("")
    }, [initialValues])

    useEffect(() => {
        onCredentialsChange({
            url: buildHostUrl(protocol, host, port),
            login: accessKey || null,
            password: secretKey || null,
            apiKey: null,
        })
    }, [protocol, host, port, accessKey, secretKey, onCredentialsChange])

    return (
        <Stack>
            <HostFields
                protocols={HTTP_PROTOCOLS}
                protocol={protocol}
                host={host}
                port={port}
                onProtocolChange={setProtocol}
                onHostChange={setHost}
                onPortChange={setPort}
            />
            <TextInput label="Access Key" value={accessKey}
                onChange={(e) => setAccessKey(e.currentTarget.value)} required />
            <TextInput type="password" label="Secret Key" value={secretKey}
                onChange={(e) => setSecretKey(e.currentTarget.value)}
                placeholder={initialValues ? "Leave blank to keep existing" : ""}
                required={!initialValues} />
        </Stack>
    )
}

export function BackupSourcesManager() {
    const [activeTab, setActiveTab] = useState<string | null>("postgres")
    const [modalOpened, setModalOpened] = useState(false)
    const [sourceType, setSourceType] = useState<string>("postgres")
    const [sourceName, setSourceName] = useState<string>("")
    const [credentials, setCredentials] = useState<Credentials>({
        url: "",
        login: null,
        password: null,
        apiKey: null
    })
    const [loading, setLoading] = useState(false)
    const [sources, setSources] = useState<BackupSource[]>([])
    const [loadingSources, setLoadingSources] = useState(false)
    const [notification, setNotification] = useState<NotificationState | null>(null)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [editingSource, setEditingSource] = useState<BackupSource | null>(null)
    const [version, setVersion] = useState<string | null>(null)

    // Fetch backup sources
    const fetchSources = async () => {
        setLoadingSources(true)
        setNotification(null)
        try {
            const response = await get("backup-sources/list")
            
            if (response.status >= 400) {
                setNotification({ 
                    message: response.detail || "Failed to fetch backup sources", 
                    statusCode: response.status 
                })
                return
            }

            const backupSources = response.data?.backup_sources
            if (Array.isArray(backupSources)) {
                setSources(backupSources)
            }
        } catch (err) {
            setNotification({ message: "Failed to fetch backup sources", statusCode: 500 })
            console.error(err)
        } finally {
            setLoadingSources(false)
        }
    }

    useEffect(() => {
        fetchSources()
    }, [])

    const handleCredentialsChange = useCallback((newCredentials: Credentials) => {
        setCredentials(newCredentials)
    }, [])

    const getCredentialsComponent = () => {
        const props = { 
            onCredentialsChange: handleCredentialsChange, 
            initialValues: editingSource 
        }
        switch (sourceType) {
            case "postgres":
                return <ExportPostgresCredentials {...props} />
            case "qdrant":
                return <ExportQdrantCredentials {...props} />
            case "elasticsearch":
                return <ExportElasticsearchCredentials {...props} />
            case "vault":
                return <ExportVaultCredentials {...props} />
            case "mysql":
                return <ExportMySQLCredentials {...props} />
            case "mongodb":
                return <ExportMongoDBCredentials {...props} />
            case "minio":
                return <ExportMinIOCredentials {...props} />
            case "neo4j":
                return <ExportNeo4jCredentials {...props} />
            default:
                return null
        }
    }

    const getFilteredSources = (type: string) => {
        return sources.filter(s => s.source_type === type)
    }

    const handleAddSource = async () => {
        // Validate credentials
        if (!credentials.url) {
            setNotification({ message: "Please fill in all required credentials", statusCode: 400 })
            return
        }

        setLoading(true)
        setNotification(null)
        try {
            const payload = {
                source_type: sourceType,
                source_name: sourceName || undefined,
                version: version || null,
                credentials: {
                    url: credentials.url,
                    login: credentials.login || null,
                    password: credentials.password || null,
                    api_key: credentials.apiKey || null
                }
            }

            const response = await post("backup-sources/add", payload)
            
            if (response.status >= 400) {
                setNotification({ 
                    message: response.detail || "Failed to add backup source", 
                    statusCode: response.status 
                })
                return
            }

            setNotification({
                message: response.message || "Backup source added successfully",
                statusCode: response.status
            })

            setModalOpened(false)
            setSourceName("")
            setVersion(null)
            setCredentials({
                url: "",
                login: null,
                password: null,
                apiKey: null
            })
            setSourceType("postgres")
            setEditingId(null)
            setEditingSource(null)

            await fetchSources()
        } catch (err) {
            setNotification({ message: "Failed to add backup source", statusCode: 500 })
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateSource = async (sourceId: number) => {
        if (!credentials.url) {
            setNotification({ message: "Please fill in required credentials", statusCode: 400 })
            return
        }

        setLoading(true)
        setNotification(null)
        try {
            // Only include fields that have values (allow keeping existing encrypted fields)
            const credentialsToSend: any = {
                url: credentials.url
            }
            
            if (credentials.login !== null && credentials.login !== undefined && credentials.login !== "") {
                credentialsToSend.login = credentials.login
            }
            
            if (credentials.password !== null && credentials.password !== undefined && credentials.password !== "") {
                credentialsToSend.password = credentials.password
            }
            
            if (credentials.apiKey !== null && credentials.apiKey !== undefined && credentials.apiKey !== "") {
                credentialsToSend.api_key = credentials.apiKey
            }

            const payload = {
                source_id: sourceId,
                source_name: sourceName || undefined,
                version: version ?? undefined,
                credentials: credentialsToSend
            }

            const response = await post("backup-sources/update", payload)
            
            if (response.status >= 400) {
                setNotification({ 
                    message: response.detail || "Failed to update backup source", 
                    statusCode: response.status 
                })
                return
            }

            setNotification({ 
                message: response.message || "Backup source updated successfully", 
                statusCode: response.status 
            })
            
            // Reset form
            setModalOpened(false)
            setEditingId(null)
            setEditingSource(null)
            setSourceName("")
            setVersion(null)
            setCredentials({
                url: "",
                login: null,
                password: null,
                apiKey: null
            })
            
            await fetchSources()
        } catch (err) {
            setNotification({ message: "Failed to update backup source", statusCode: 500 })
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteSource = async (sourceId: number) => {
        if (!window.confirm("Are you sure you want to delete this backup source?")) return

        setNotification(null)
        try {
            const response = await del(`backup-sources/delete?source_id=${sourceId}`)
            
            if (response.status >= 400) {
                setNotification({ 
                    message: response.detail || "Failed to delete backup source", 
                    statusCode: response.status 
                })
                return
            }

            setNotification({ 
                message: response.message || "Backup source deleted successfully", 
                statusCode: response.status 
            })
            await fetchSources()
        } catch (err) {
            setNotification({ message: "Failed to delete backup source", statusCode: 500 })
            console.error(err)
        }
    }

    const handleTestConnection = async (sourceId: number) => {
        setNotification(null)
        try {
            const response = await get(`backup-sources/test-connection?source_id=${sourceId}`)
            
            if (response.status >= 400) {
                setNotification({ 
                    message: response.detail || "Connection test failed", 
                    statusCode: response.status 
                })
                return
            }

            setNotification({ 
                message: response.message || "Connection successful", 
                statusCode: response.status 
            })
        } catch (err) {
            setNotification({ message: "Connection test failed", statusCode: 500 })
            console.error(err)
        }
    }

    const openAddModal = () => {
        setEditingId(null)
        setEditingSource(null)
        setSourceName("")
        setVersion(null)
        setCredentials({
            url: "",
            login: null,
            password: null,
            apiKey: null
        })
        setSourceType(activeTab || "postgres")
        setModalOpened(true)
    }

    const openEditModal = (source: BackupSource) => {
        setEditingId(source.id)
        setEditingSource(source)
        setSourceName(source.name)
        setSourceType(source.source_type)
        setVersion(source.version ?? null)
        // Reset credentials - they will be populated by the credential component's useEffect
        setCredentials({
            url: "",
            login: null,
            password: null,
            apiKey: null
        })
        setModalOpened(true)
    }

    const isFormValid = () => {
        if (!sourceName || !credentials.url) return false
        
        // Additional validation based on source type
        switch (sourceType) {
            case "postgres":
                return !!(credentials.login && (editingId || credentials.password))
            case "vault":
                return !!(editingId || credentials.apiKey)
            case "mysql":
            case "neo4j":
                return !!(credentials.login && (editingId || credentials.password))
            case "minio":
                return !!(credentials.login && (editingId || credentials.password))
            case "mongodb":
            case "qdrant":
            case "elasticsearch":
                return true
            default:
                return true
        }
    }

    const SourceTable = ({ sources }: { sources: BackupSource[] }) => (
        <Table striped>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>URL</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {sources.length === 0 ? (
                    <Table.Tr>
                        <Table.Td colSpan={4}>
                            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--lnr-text-faint)", fontSize: 13 }}>
                                No sources configured
                            </div>
                        </Table.Td>
                    </Table.Tr>
                ) : (
                    sources.map((source) => (
                        <Table.Tr key={source.id}>
                            <Table.Td>
                                <Group gap={8} wrap="nowrap">
                                    <ProductIcon type={source.source_type} size={16} />
                                    <span>{source.name}</span>
                                </Group>
                            </Table.Td>
                            <Table.Td style={{ fontSize: 12 }}>{source.url}</Table.Td>
                            <Table.Td style={{ fontSize: 12 }}>
                                {new Date(source.created_at).toLocaleDateString()}
                            </Table.Td>
                            <Table.Td>
                                <Group gap={8}>
                                    <ActionIcon 
                                        size="sm"
                                        variant="default"
                                        onClick={() => handleTestConnection(source.id)}
                                        title="Test Connection"
                                    >
                                        <IconCheck size={16} />
                                    </ActionIcon>
                                    <ActionIcon 
                                        size="sm"
                                        variant="default"
                                        onClick={() => openEditModal(source)}
                                        title="Edit Source"
                                    >
                                        <IconEdit size={16} />
                                    </ActionIcon>
                                    <ActionIcon 
                                        color="red" 
                                        variant="subtle"
                                        onClick={() => handleDeleteSource(source.id)}
                                        title="Delete Source"
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
    )

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
                    Connected Applications
                </span>
                <Group gap={8}>
                    <ActionIcon
                        onClick={fetchSources}
                        loading={loadingSources}
                        variant="subtle"
                        color="gray"
                        size="sm"
                    >
                        <IconRefresh size={14} />
                    </ActionIcon>
                    <Button
                        leftSection={<IconPlus size={14} />}
                        onClick={openAddModal}
                        size="xs"
                    >
                        Add Source
                    </Button>
                </Group>
            </Group>

            {notification && (
                <DisplayNotification 
                    message={notification.message} 
                    statusCode={notification.statusCode} 
                />
            )}

            {loadingSources ? (
                <Loader />
            ) : (
                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="postgres" leftSection={<ProductIcon type="postgres" size={14} />}>
                            PostgreSQL ({getFilteredSources("postgres").length})
                        </Tabs.Tab>
                        <Tabs.Tab value="elasticsearch" leftSection={<ProductIcon type="elasticsearch" size={14} />}>
                            Elasticsearch ({getFilteredSources("elasticsearch").length})
                        </Tabs.Tab>
                        <Tabs.Tab value="vault" leftSection={<ProductIcon type="vault" size={14} />}>
                            Vault ({getFilteredSources("vault").length})
                        </Tabs.Tab>
                        <Tabs.Tab value="qdrant" leftSection={<ProductIcon type="qdrant" size={14} />}>
                            Qdrant ({getFilteredSources("qdrant").length})
                        </Tabs.Tab>
                        <Tabs.Tab value="mysql" leftSection={<ProductIcon type="mysql" size={14} />}>
                            MySQL ({getFilteredSources("mysql").length})
                        </Tabs.Tab>
                        <Tabs.Tab value="mongodb" leftSection={<ProductIcon type="mongodb" size={14} />}>
                            MongoDB ({getFilteredSources("mongodb").length})
                        </Tabs.Tab>
                        <Tabs.Tab value="minio" leftSection={<ProductIcon type="minio" size={14} />}>
                            MinIO ({getFilteredSources("minio").length})
                        </Tabs.Tab>
                        <Tabs.Tab value="neo4j" leftSection={<ProductIcon type="neo4j" size={14} />}>
                            Neo4j ({getFilteredSources("neo4j").length})
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="postgres" pt="md">
                        <SourceTable sources={getFilteredSources("postgres")} />
                    </Tabs.Panel>
                    <Tabs.Panel value="elasticsearch" pt="md">
                        <SourceTable sources={getFilteredSources("elasticsearch")} />
                    </Tabs.Panel>
                    <Tabs.Panel value="vault" pt="md">
                        <SourceTable sources={getFilteredSources("vault")} />
                    </Tabs.Panel>
                    <Tabs.Panel value="qdrant" pt="md">
                        <SourceTable sources={getFilteredSources("qdrant")} />
                    </Tabs.Panel>
                    <Tabs.Panel value="mysql" pt="md">
                        <SourceTable sources={getFilteredSources("mysql")} />
                    </Tabs.Panel>
                    <Tabs.Panel value="mongodb" pt="md">
                        <SourceTable sources={getFilteredSources("mongodb")} />
                    </Tabs.Panel>
                    <Tabs.Panel value="minio" pt="md">
                        <SourceTable sources={getFilteredSources("minio")} />
                    </Tabs.Panel>
                    <Tabs.Panel value="neo4j" pt="md">
                        <SourceTable sources={getFilteredSources("neo4j")} />
                    </Tabs.Panel>
                </Tabs>
            )}

            <Modal 
                opened={modalOpened} 
                onClose={() => {
                    setModalOpened(false)
                    setEditingId(null)
                    setEditingSource(null)
                }}
                title={editingId ? "Edit Backup Source" : "Add Backup Source"}
                size="lg"
            >
                <Stack>
                    {!editingId && (
                        <Select
                            data={SOURCE_OPTIONS}
                            searchable
                            value={sourceType}
                            label="Source Type"
                            leftSection={<ProductIcon type={sourceType} size={16} />}
                            renderOption={({ option }) => (
                                <Group gap={8} wrap="nowrap">
                                    <ProductIcon type={option.value} size={16} />
                                    <span>{option.label}</span>
                                </Group>
                            )}
                            onChange={(value) => setSourceType(value || "postgres")}
                            required
                        />
                    )}

                    <TextInput
                        label="Source Name"
                        value={sourceName}
                        onChange={(e) => setSourceName(e.currentTarget.value)}
                        placeholder="e.g., Production DB"
                        required
                    />

                    {VERSION_OPTIONS[sourceType] && (
                        <Select
                            label="Server Version"
                            placeholder="Select version"
                            data={VERSION_OPTIONS[sourceType]}
                            value={version}
                            onChange={setVersion}
                            clearable
                        />
                    )}

                    {getCredentialsComponent()}

                    <Group mt={20}>
                        <Button
                            onClick={() => editingId ? handleUpdateSource(editingId) : handleAddSource()}
                            disabled={!isFormValid()}
                            loading={loading}
                        >
                            {editingId ? "Update" : "Add"} Source
                        </Button>
                        <Button 
                            variant="default" 
                            onClick={() => {
                                setModalOpened(false)
                                setEditingId(null)
                                setEditingSource(null)
                            }}
                        >
                            Cancel
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </div>
    )
}
