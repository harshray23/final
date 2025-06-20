
"use client";
import React, { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, CheckCircle, XCircle, AlertTriangle, Info, Loader2 } from "lucide-react";
import type { Student, Batch, Teacher, AttendanceRecord, Announcement } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AnnouncementDialog } from "@/components/shared/AnnouncementDialog";
import { USER_ROLES } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

interface StudentDashboardData {
  student?: Student;
  batch?: Batch & { teacherName?: string };
  attendance?: AttendanceRecord[];
}

const getStatusIcon = (status: "present" | "absent" | "late") => {
  switch (status) {
    case "present":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "absent":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "late":
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    default:
      return null;
  }
};

const LOCAL_STORAGE_ANNOUNCEMENT_KEY = "aecFspAnnouncements";

export default function StudentDashboardPage() {
  const [dashboardData, setDashboardData] = useState<StudentDashboardData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [isAnnouncementDialogOpen, setIsAnnouncementDialogOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        let studentIdFromStorage: string | null = null;
        const storedUserJSON = localStorage.getItem("currentUser");
        
        if (storedUserJSON) {
            const user = JSON.parse(storedUserJSON);
            if (user && user.role === USER_ROLES.STUDENT && (user.studentId || user.id)) {
                studentIdFromStorage = user.studentId || user.id;
            } else {
                console.warn("Stored user in localStorage is not a valid student or is missing ID fields:", user);
                localStorage.removeItem("currentUser"); // Clear invalid/corrupted item
            }
        }

        if (!studentIdFromStorage) {
            toast({
                title: "Authentication Issue",
                description: "Your session seems to be invalid or has expired. Please log in again.",
                variant: "destructive",
            });
            router.push("/auth/login?role=student");
            return; 
        }
        
        const studentRes = await fetch(`/api/students/profile?studentId=${studentIdFromStorage}`);

        if (!studentRes) {
          console.error("Fetch student profile: No response received from server.");
          throw new Error("Failed to fetch student profile: Server did not respond.");
        }
        
        if (!studentRes.ok) {
          let errorMessage = `Failed to fetch student profile (status: ${studentRes.status} ${studentRes.statusText || ''})`.trim();
          try {
            const errorBody = await studentRes.json(); 
            if (errorBody && errorBody.message) {
              errorMessage = errorBody.message;
            }
          } catch (e) {
             console.warn("Could not parse error response as JSON from student profile API.", e);
          }
          console.error("Error response from /api/students/profile:", errorMessage);
          throw new Error(errorMessage);
        }
        
        let student: Student;
        try {
          const studentData = await studentRes.json();
          student = studentData;
        } catch (jsonError: any) {
          console.error("Failed to parse JSON from successful student profile response:", jsonError);
          let responseText = "Could not read response text.";
          try {
            responseText = await studentRes.text();
          } catch (textError) {
            console.error("Error reading response text after JSON parse failure:", textError);
          }
          console.error("Response Text from /api/students/profile:", responseText);
          throw new Error("Received malformed data from the server for student profile.");
        }
        
        let batchData: (Batch & { teacherName?: string }) | undefined = undefined;
        let attendanceData: AttendanceRecord[] = [];

        if (student && student.batchId) {
          const batchRes = await fetch(`/api/batches/${student.batchId}`);
          if (batchRes.ok) {
            const batch: Batch = await batchRes.json();
            let teacherName = "N/A";
            if (batch.teacherId) {
              const teacherRes = await fetch(`/api/teachers/${batch.teacherId}`);
              if (teacherRes.ok) {
                const teacher: Teacher = await teacherRes.json();
                teacherName = teacher.name;
              } else {
                console.warn(`Failed to fetch teacher details for ID ${batch.teacherId}: ${teacherRes.status}`);
              }
            }
            batchData = { ...batch, teacherName };

            const attendanceRes = await fetch(`/api/attendance?studentId=${student.id}&batchId=${student.batchId}`);
            if (attendanceRes.ok) {
              attendanceData = await attendanceRes.json();
            } else {
              console.warn(`Failed to fetch attendance for student ${student.id}, batch ${student.batchId}: ${attendanceRes.status}`);
            }

          } else {
             console.warn(`Failed to fetch batch details for ID ${student.batchId}: ${batchRes.status}`);
          }
        }
        
        setDashboardData({ student, batch: batchData, attendance: attendanceData });

      } catch (err: any) {
        console.error("Full error fetching student dashboard data:", err);
        setError(err.message || "An unexpected error occurred while loading your dashboard.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();

    // Check for announcements
    const announcementsRaw = localStorage.getItem(LOCAL_STORAGE_ANNOUNCEMENT_KEY);
    if (announcementsRaw) {
      const announcements: Announcement[] = JSON.parse(announcementsRaw);
      if (announcements.length > 0) {
        const latest = announcements.sort((a, b) => b.timestamp - a.timestamp)[0];
        const dismissedKey = `dismissed_announcement_${latest.id}`;
        if (!sessionStorage.getItem(dismissedKey)) {
          setLatestAnnouncement(latest);
          setIsAnnouncementDialogOpen(true);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // router and toast are stable, no need to add to deps for this effect

  const handleCloseAnnouncementDialog = () => {
    if (latestAnnouncement) {
      sessionStorage.setItem(`dismissed_announcement_${latestAnnouncement.id}`, "true");
    }
    setIsAnnouncementDialogOpen(false);
    setLatestAnnouncement(null);
  };

  const studentName = dashboardData.student?.name || "Student";
  
  const formatTimetable = (batch?: Batch) => {
    if (!batch || !batch.daysOfWeek || !batch.startTime || !batch.endTime) return "N/A";
    return `${batch.daysOfWeek.join(', ')} from ${batch.startTime} to ${batch.endTime}`;
  };


  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader title="Loading Dashboard..." icon={Loader2} description="Fetching your details, please wait."/>
        <Card><CardHeader><CardTitle>My Assigned Batch</CardTitle></CardHeader><CardContent><Loader2 className="animate-spin h-8 w-8 text-primary mx-auto" /></CardContent></Card>
        <Card><CardHeader><CardTitle>My Attendance Records</CardTitle></CardHeader><CardContent><Loader2 className="animate-spin h-8 w-8 text-primary mx-auto" /></CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
         <PageHeader title="Error" icon={AlertTriangle} description="Could not load your dashboard."/>
         <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Loading Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="space-y-8">
      <AnnouncementDialog
        announcement={latestAnnouncement}
        isOpen={isAnnouncementDialogOpen}
        onClose={handleCloseAnnouncementDialog}
      />
      <PageHeader
        title={`Welcome, ${studentName}!`}
        description="Here's an overview of your FSP engagement."
        icon={GraduationCap}
      />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>My Assigned Batch</CardTitle>
          <CardDescription>Details about your current Finishing School Program batch.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {dashboardData.batch ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Batch Name:</span>
                <span className="font-medium">{dashboardData.batch.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Topic:</span>
                <span className="font-medium">{dashboardData.batch.topic}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timetable:</span>
                <span className="font-medium">{formatTimetable(dashboardData.batch)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assigned Teacher:</span>
                <span className="font-medium">{dashboardData.batch.teacherName || "N/A"}</span>
              </div>
            </>
          ) : (
            <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No Batch Assigned</AlertTitle>
                <AlertDescription>You are not currently assigned to any batch. Please contact administration if this is an error.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>My Attendance Records</CardTitle>
          <CardDescription>Your attendance for recent FSP sessions in your current batch.</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboardData.batch ? (
            dashboardData.attendance && dashboardData.attendance.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Subject/Module</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboardData.attendance.map((record, index) => (
                  <TableRow key={record.id || index}>
                    <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                    <TableCell>{record.subject}</TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant={record.status === "absent" ? "destructive" : record.status === "late" ? "secondary" : "default"}
                        className="flex items-center gap-1.5 justify-end w-24 ml-auto"
                      >
                        {getStatusIcon(record.status)}
                        {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            ) : (
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>No Attendance Records</AlertTitle>
                    <AlertDescription>No attendance records found for you in this batch yet.</AlertDescription>
                </Alert>
            )
          ) : (
             <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No Batch Assigned</AlertTitle>
                <AlertDescription>Attendance records cannot be shown as you are not assigned to a batch.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

