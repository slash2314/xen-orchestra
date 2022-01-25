import CircularProgress from '@mui/material/CircularProgress'
import React from 'react'
import styled from 'styled-components'

import { withState } from 'reaclette'
import { Route } from 'react-router-dom'

interface ParentState {}

interface State {}

interface Props {}

interface ParentEffects {}

interface Effects {}

interface Computed {}

const Container = styled.div`
  display: flex;
  overflow: hidden;
  flex-direction: row;
  align-content: space-between;
  gap: 1.25em;
  background: '#E8E8E8';
`

const Panel = styled.div`
  background: #ffffff;
  padding: 1.5em;
  margin: 0.5em;
`

const getHostPowerState = (host: Host) => {
  const { $metrics } = host
  return $metrics ? ($metrics.live ? 'Running' : 'Halted') : 'Unknown'
}

const ObjectStatus = withState<State, Props, Effects, Computed, ParentState, ParentEffects>(
  {
    /*initialState: props => ({
        selectedVm: props.location.pathname.split('/')[3],
      }),*/
    computed: {
      objects: (state, { type }) => state.objectsByType?.get(type),
      nTotal: (state, { objects }) => objects?.size,
      nActive: (state, { objects }) =>
        objects?.filter(obj => obj.power_state ?? getHostPowerState(obj) === 'Running').size,
      nInactive: (state, { nTotal = 0, nActive = 0 }) => nTotal - nActive,
    },
  },
  ({ state: { nTotal = 0, nActive = 0, nInactive = 0 } }) => {
    return (
      <CircularProgress
        variant='determinate'
        value={(nActive * 100) / nTotal}
        style={{ color: '#00BA34' }}
        size={'10%'}
      />
    )
  }
)

const Dashboard = withState<State, Props, Effects, Computed, ParentState, ParentEffects>(
  {
    /*initialState: props => ({
        selectedVm: props.location.pathname.split('/')[3],
      }),*/
  },
  () => {
    return (
      <Container>
        <Panel>
          <ObjectStatus type='host' />
        </Panel>
        <Panel>
          <span>RAJAA</span>
        </Panel>
      </Container>
    )
  }
)

export default Dashboard
