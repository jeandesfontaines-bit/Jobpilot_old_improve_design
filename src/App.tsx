import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { JobsView } from './components/JobsView';
import { CvLibraryView } from './components/CvLibraryView';
import { ProfileView } from './components/ProfileView';
import { ApplicationsView } from './components/ApplicationsView';
import { SettingsView } from './components/SettingsView';
import { getJobs, getApplications, getCart, getPipelineStatus } from './services/api';
import { Job, PipelineStatus } from './types';

export default function App() {
  const [currentTab, setCurrentTab] = useState('jobs');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsReady, setJobsReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [appliedJobsCount, setAppliedJobsCount] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'retained' | 'excluded'>('retained');
  const requestId = useRef(0);

  const refreshData = useCallback(async () => {
    const id = ++requestId.current;
    setRefreshing(true);
    const [jobResult, appResult, cartResult, pipeResult] = await Promise.allSettled([
      getJobs({ sort: 'date_desc', include_excluded: true }),
      getApplications(),
      getCart(),
      getPipelineStatus(),
    ]);

    if (id !== requestId.current) return;

    if (jobResult.status === 'fulfilled' && Array.isArray(jobResult.value)) {
      setJobs(jobResult.value);
      setJobsReady(true);
      setJobsError(null);
    } else {
      const error = jobResult.status === 'rejected' ? jobResult.reason : null;
      setJobsError(error?.response?.data?.error || error?.message || 'Impossible de charger les offres');
    }

    if (appResult.status === 'fulfilled' && Array.isArray(appResult.value)) {
      setAppliedJobsCount(appResult.value.length);
    }

    if (cartResult.status === 'fulfilled' && cartResult.value && typeof cartResult.value.count === 'number') {
      setCartCount(cartResult.value.count);
    }

    if (pipeResult.status === 'fulfilled' && pipeResult.value) {
      setPipelineStatus(pipeResult.value);
    }

    setRefreshing(false);
  }, []);

  useEffect(() => {
    void refreshData();
    const timer = setInterval(() => {
      void refreshData();
    }, 20000);
    return () => clearInterval(timer);
  }, [currentTab, refreshData]);

  const retainedJobsCount = jobs.filter((job) => !job.is_excluded).length;
  const excludedJobsCount = jobs.filter((job) => job.is_excluded).length;
  const newJobsCount = jobs.filter((job) => job.is_new && !job.is_excluded).length;

  useEffect(() => {
    document.title = newJobsCount > 0 ? `(${newJobsCount}) JobPilot` : 'JobPilot';
  }, [newJobsCount]);

  const handleStatusUpdated = (status?: string) => {
    if (status && selectedJob) {
      setSelectedJob({ ...selectedJob, status: status as Job['status'] });
      setJobs((current) =>
        current.map((job) => (job.id === selectedJob.id ? { ...job, status: status as Job['status'] } : job))
      );
    }
    void refreshData();
  };

  return (
    <AppLayout
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
      appliedJobsCount={appliedJobsCount}
      retainedJobsCount={retainedJobsCount}
      excludedJobsCount={excludedJobsCount}
      cartCount={cartCount}
      pilotStatus={pipelineStatus}
      jobsReady={jobsReady}
    >
      {(currentTab === 'jobs' || currentTab === 'cart') && (
        <JobsView
          jobs={jobs}
          loading={!jobsReady && !jobsError}
          refreshing={refreshing}
          loadError={jobsError}
          onReload={refreshData}
          selectedJob={selectedJob}
          onSelectJob={setSelectedJob}
          onStatusUpdated={handleStatusUpdated}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          initialShowCart={currentTab === 'cart'}
          onCartClosed={() => {
            if (currentTab === 'cart') {
              setCurrentTab('jobs');
            }
          }}
        />
      )}
      {currentTab === 'applications' && <ApplicationsView />}
      {currentTab === 'cvs' && <CvLibraryView />}
      {currentTab === 'profile' && <ProfileView />}
      {currentTab === 'settings' && (
        <SettingsView
          refreshKey={refreshKey}
          onRefreshed={() => {
            setRefreshKey((key) => key + 1);
            void refreshData();
          }}
        />
      )}
    </AppLayout>
  );
}
